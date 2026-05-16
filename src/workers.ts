/**
 * Radient — BullMQ Workers
 * Import, Match, and YouTube workers processing jobs from Redis queues.
 */
import { Worker, Job } from 'bullmq';
import { config } from './config';
import db from './db';
import { getValidSpotifyToken } from './auth/spotify-oauth';
import { matchTrack } from './matching/engine';
import { matchOnYouTube } from './matching/youtube';
import { matchQueue, youtubeQueue } from './queues';
import crypto from 'crypto';

import IORedis from 'ioredis';

const connectionOptions = config.redis.url 
  ? new IORedis(config.redis.url, { maxRetriesPerRequest: null })
  : new IORedis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      maxRetriesPerRequest: null
    });

const connection = connectionOptions;
// #region agent log
fetch('http://127.0.0.1:7885/ingest/5d3b2723-a535-4ccc-ab6a-c8f61aeb268b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'08e7ba'},body:JSON.stringify({sessionId:'08e7ba',runId:'baseline',hypothesisId:'H1',location:'src/workers.ts:26',message:'Workers module initialized',data:{redisUrlConfigured:!!config.redis.url,redisHost:config.redis.host,redisPort:config.redis.port},timestamp:Date.now()})}).catch(()=>{});
// #endregion

// ═══════════════════════════════════════
// IMPORT WORKER — fetches Spotify tracks, caches metadata, creates playlist
// ═══════════════════════════════════════
export const importWorker = new Worker('radient-import', async (job: Job) => {
  const { importJobId, spotifyPlaylistId } = job.data;

  db.prepare("UPDATE import_jobs SET status='fetching', started_at=unixepoch() WHERE id=?")
    .run(importJobId);

  const token = await getValidSpotifyToken();

  // Fetch playlist metadata
  const plMeta = await fetch(`https://api.spotify.com/v1/playlists/${spotifyPlaylistId}?fields=name,description,snapshot_id`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json());

  // Paginate all tracks
  const allTracks: any[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${spotifyPlaylistId}/tracks?limit=100&fields=items(track(id,name,artists(name,id),album(name,images),duration_ms,external_ids)),next,total`;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Spotify ${res.status}`);
    const data = await res.json();
    allTracks.push(...data.items.filter((i: any) => i.track?.id).map((i: any) => i.track));
    url = data.next;
    await job.updateProgress(Math.round(allTracks.length / (data.total || 1) * 40));
    await sleep(100);
  }

  // Create Radient playlist
  const playlistId = 'pl_' + crypto.randomBytes(8).toString('hex');
  db.prepare(`INSERT INTO playlists_v2 (id, user_id, name, description,
    spotify_playlist_id, spotify_snapshot_id, track_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(playlistId, 'usr_default', plMeta.name, plMeta.description || '',
      spotifyPlaylistId, plMeta.snapshot_id, allTracks.length);

  // Cache spotify tracks + create mappings + link to playlist
  const insertSp = db.prepare(`INSERT INTO spotify_tracks (spotify_id, title, artists, album, album_art, duration_ms, isrc, popularity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(spotify_id) DO UPDATE SET fetched_at=unixepoch()`);
  const insertMap = db.prepare(`INSERT INTO track_mappings (spotify_track_id, match_strategy, confidence, status)
    VALUES (?, 'pending', 0, 'pending') ON CONFLICT(spotify_track_id) DO NOTHING`);
  const getMapId = db.prepare('SELECT id FROM track_mappings WHERE spotify_track_id = ?');
  const insertPt = db.prepare(`INSERT OR IGNORE INTO playlist_tracks_v2 (playlist_id, track_mapping_id, position) VALUES (?, ?, ?)`);

  const batchInsert = db.transaction((tracks: any[]) => {
    tracks.forEach((t, i) => {
      insertSp.run(t.id, t.name, JSON.stringify(t.artists), t.album?.name,
        t.album?.images?.[0]?.url, t.duration_ms, t.external_ids?.isrc, t.popularity);
      insertMap.run(t.id);
      const map = getMapId.get(t.id) as any;
      if (map) insertPt.run(playlistId, map.id, i);
    });
  });

  batchInsert(allTracks);

  db.prepare("UPDATE import_jobs SET status='matching', playlist_id=?, total_tracks=? WHERE id=?")
    .run(playlistId, allTracks.length, importJobId);

  await job.updateProgress(50);

  // Enqueue matching in batches
  const BATCH = config.matching.batchSize;
  const ids = allTracks.map(t => t.id);
  for (let i = 0; i < ids.length; i += BATCH) {
    await matchQueue.add('match-batch', {
      importJobId, spotifyTrackIds: ids.slice(i, i + BATCH),
    });
  }

  return { playlistId, totalTracks: allTracks.length };
}, { connection, concurrency: 2 });

// ═══════════════════════════════════════
// MATCH WORKER — runs matching engine per batch
// ═══════════════════════════════════════
export const matchWorker = new Worker('radient-match', async (job: Job) => {
  const { importJobId, spotifyTrackIds } = job.data;

  for (const spId of spotifyTrackIds) {
    try {
      const result = await matchTrack(spId);

      if (result.strategy === 'youtube_pending') {
        // Delegate to YouTube worker
        await youtubeQueue.add('yt-match', { spotifyTrackId: spId, importJobId });
      } else {
        db.prepare(`UPDATE track_mappings SET
          radient_track_id=?, jiosaavn_id=?, match_strategy=?,
          confidence=?, status=?, attempt_count=attempt_count+1, last_attempt_at=unixepoch()
          WHERE spotify_track_id=?`)
          .run(result.radientTrackId || null, result.jiosaavnId || null,
            result.strategy, result.confidence,
            result.confidence >= config.matching.autoAcceptThreshold ? 'matched' : 'review',
            spId);

        // Increment matched count
        db.prepare('UPDATE import_jobs SET matched_tracks=matched_tracks+1 WHERE id=?').run(importJobId);
      }
    } catch (err: any) {
      console.error(`[Match] Error for ${spId}:`, err.message);
      db.prepare("UPDATE track_mappings SET status='failed', attempt_count=attempt_count+1 WHERE spotify_track_id=?").run(spId);
      db.prepare('UPDATE import_jobs SET failed_tracks=failed_tracks+1 WHERE id=?').run(importJobId);
    }
    await sleep(150); // Rate limit JioSaavn
  }

  // Check if import is complete
  checkImportCompletion(importJobId);
}, { connection, concurrency: 3 });

// ═══════════════════════════════════════
// YOUTUBE WORKER — fallback matching
// ═══════════════════════════════════════
export const youtubeWorker = new Worker('radient-youtube', async (job: Job) => {
  const { spotifyTrackId, importJobId } = job.data;
  const sp = db.prepare('SELECT * FROM spotify_tracks WHERE spotify_id=?').get(spotifyTrackId) as any;
  if (!sp) return;

  const artists = JSON.parse(sp.artists).map((a: any) => a.name || a);
  const match = await matchOnYouTube(sp.title, artists, sp.duration_ms);

  if (match && match.confidence >= config.matching.youtubeThreshold) {
    db.prepare(`UPDATE track_mappings SET youtube_video_id=?, confidence=?,
      match_strategy='youtube', status='matched', attempt_count=attempt_count+1,
      last_attempt_at=unixepoch() WHERE spotify_track_id=?`)
      .run(match.videoId, match.confidence, spotifyTrackId);
    db.prepare('UPDATE import_jobs SET matched_tracks=matched_tracks+1 WHERE id=?').run(importJobId);
  } else {
    db.prepare("UPDATE track_mappings SET status='failed', attempt_count=attempt_count+1, last_attempt_at=unixepoch() WHERE spotify_track_id=?")
      .run(spotifyTrackId);
    db.prepare('UPDATE import_jobs SET failed_tracks=failed_tracks+1 WHERE id=?').run(importJobId);
  }

  checkImportCompletion(importJobId);
}, { connection, concurrency: 2 });

// ── Helper: check if all tracks processed ──
function checkImportCompletion(importJobId: string) {
  const job = db.prepare('SELECT total_tracks, matched_tracks, failed_tracks FROM import_jobs WHERE id=?')
    .get(importJobId) as any;
  if (!job) return;
  if (job.matched_tracks + job.failed_tracks >= job.total_tracks) {
    db.prepare("UPDATE import_jobs SET status='complete', completed_at=unixepoch() WHERE id=?").run(importJobId);
    console.log(`[Import] ✓ Job ${importJobId} complete: ${job.matched_tracks}/${job.total_tracks} matched`);
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Log worker events
for (const w of [importWorker, matchWorker, youtubeWorker]) {
  // #region agent log
  fetch('http://127.0.0.1:7885/ingest/5d3b2723-a535-4ccc-ab6a-c8f61aeb268b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'08e7ba'},body:JSON.stringify({sessionId:'08e7ba',runId:'baseline',hypothesisId:'H1',location:'src/workers.ts:182',message:'Worker event hooks attached',data:{workerName:w.name},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  w.on('failed', (job, err) => console.error(`[Worker:${w.name}] Job ${job?.id} failed:`, err.message));
  w.on('completed', (job) => console.log(`[Worker:${w.name}] Job ${job.id} done`));
}

console.log('[Workers] Import, Match, YouTube workers started');
