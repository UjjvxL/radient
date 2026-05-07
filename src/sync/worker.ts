/**
 * Radient — Playlist Sync Engine
 * Polls synced Spotify playlists for changes and updates Radient automatically.
 */
import { Worker, Job } from 'bullmq';
import { config } from '../config';
import db from '../db';
import { getValidSpotifyToken } from '../auth/spotify-oauth';
import { matchQueue, syncQueue } from '../queues';
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

// ─── Sync Worker ───
export const syncWorker = new Worker('radient-sync', async (job: Job) => {
  const { playlistId } = job.data;

  const playlist = db.prepare('SELECT * FROM playlists_v2 WHERE id = ?').get(playlistId) as any;
  if (!playlist?.sync_enabled || !playlist.spotify_playlist_id) return;

  db.prepare("UPDATE sync_state SET sync_status='syncing' WHERE playlist_id=?").run(playlistId);

  try {
    const token = await getValidSpotifyToken();

    // Fetch current Spotify state
    const spRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlist.spotify_playlist_id}?fields=snapshot_id,name,tracks.total`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (spRes.status === 404) {
      db.prepare("UPDATE sync_state SET sync_status='playlist_deleted', error='Playlist deleted on Spotify' WHERE playlist_id=?").run(playlistId);
      db.prepare('UPDATE playlists_v2 SET sync_enabled=0 WHERE id=?').run(playlistId);
      console.log(`[Sync] Playlist ${playlistId} deleted on Spotify — sync disabled`);
      return;
    }
    if (!spRes.ok) throw new Error(`Spotify API ${spRes.status}`);

    const spPlaylist = await spRes.json();

    // No changes? Skip.
    if (spPlaylist.snapshot_id === playlist.spotify_snapshot_id) {
      db.prepare("UPDATE sync_state SET last_sync_at=unixepoch(), next_sync_at=unixepoch()+?, sync_status='idle' WHERE playlist_id=?")
        .run(config.sync.intervalMinutes * 60, playlistId);
      return;
    }

    console.log(`[Sync] Changes detected for "${playlist.name}" — syncing...`);

    // Fetch all current tracks
    const currentTracks = await fetchAllTracks(token, playlist.spotify_playlist_id);
    const currentIds = currentTracks.map(t => t.id);

    // Get existing tracks in Radient
    const existing = db.prepare(`
      SELECT pt.position, tm.spotify_track_id, pt.track_mapping_id
      FROM playlist_tracks_v2 pt
      JOIN track_mappings tm ON pt.track_mapping_id = tm.id
      WHERE pt.playlist_id = ? ORDER BY pt.position
    `).all(playlistId) as any[];
    const existingIds = existing.map(e => e.spotify_track_id);

    // Diff
    const added = currentIds.filter(id => !existingIds.includes(id));
    const removed = existingIds.filter(id => !currentIds.includes(id));

    // Handle additions
    if (added.length > 0) {
      const insertSp = db.prepare(`INSERT INTO spotify_tracks (spotify_id, title, artists, album, album_art, duration_ms, isrc)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(spotify_id) DO UPDATE SET fetched_at=unixepoch()`);
      const insertMap = db.prepare(`INSERT INTO track_mappings (spotify_track_id, match_strategy, confidence, status)
        VALUES (?, 'pending', 0, 'pending') ON CONFLICT(spotify_track_id) DO NOTHING`);

      for (const spId of added) {
        const t = currentTracks.find(tr => tr.id === spId);
        if (!t) continue;
        insertSp.run(t.id, t.name, JSON.stringify(t.artists), t.album?.name,
          t.album?.images?.[0]?.url, t.duration_ms, t.external_ids?.isrc);
        insertMap.run(t.id);
        await matchQueue.add('match-batch', { importJobId: null, spotifyTrackIds: [t.id] });
      }
      console.log(`[Sync] +${added.length} tracks added`);
    }

    // Handle removals
    if (removed.length > 0) {
      const placeholders = removed.map(() => '?').join(',');
      db.prepare(`DELETE FROM playlist_tracks_v2 WHERE playlist_id = ? AND track_mapping_id IN
        (SELECT id FROM track_mappings WHERE spotify_track_id IN (${placeholders}))`)
        .run(playlistId, ...removed);
      console.log(`[Sync] -${removed.length} tracks removed`);
    }

    // Rebuild positions to match current Spotify order
    db.prepare('DELETE FROM playlist_tracks_v2 WHERE playlist_id = ?').run(playlistId);
    const getMapId = db.prepare('SELECT id FROM track_mappings WHERE spotify_track_id = ?');
    const insertPt = db.prepare('INSERT OR IGNORE INTO playlist_tracks_v2 (playlist_id, track_mapping_id, position) VALUES (?, ?, ?)');

    const rebuildPositions = db.transaction(() => {
      currentIds.forEach((spId, i) => {
        const map = getMapId.get(spId) as any;
        if (map) insertPt.run(playlistId, map.id, i);
      });
    });
    rebuildPositions();

    // Update playlist metadata
    if (spPlaylist.name && spPlaylist.name !== playlist.name) {
      db.prepare('UPDATE playlists_v2 SET name=? WHERE id=?').run(spPlaylist.name, playlistId);
    }
    db.prepare('UPDATE playlists_v2 SET spotify_snapshot_id=?, track_count=?, updated_at=unixepoch() WHERE id=?')
      .run(spPlaylist.snapshot_id, currentIds.length, playlistId);

    db.prepare("UPDATE sync_state SET last_sync_at=unixepoch(), next_sync_at=unixepoch()+?, sync_status='idle', consecutive_failures=0, error=NULL WHERE playlist_id=?")
      .run(config.sync.intervalMinutes * 60, playlistId);

    console.log(`[Sync] ✓ "${playlist.name}" synced — ${currentIds.length} tracks`);
  } catch (err: any) {
    console.error(`[Sync] Error for ${playlistId}:`, err.message);
    db.prepare("UPDATE sync_state SET sync_status='error', error=?, consecutive_failures=consecutive_failures+1 WHERE playlist_id=?")
      .run(err.message, playlistId);
  }
}, { connection, concurrency: 1 });

syncWorker.on('failed', (job, err) => console.error(`[Sync] Job ${job?.id} failed:`, err.message));

// ─── Fetch all tracks from a Spotify playlist (paginated) ───
async function fetchAllTracks(token: string, spotifyPlaylistId: string) {
  const tracks: any[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${spotifyPlaylistId}/tracks?limit=100&fields=items(track(id,name,artists(name,id),album(name,images),duration_ms,external_ids)),next,total`;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Spotify ${res.status}`);
    const data = await res.json();
    tracks.push(...data.items.filter((i: any) => i.track?.id).map((i: any) => i.track));
    url = data.next;
    await new Promise(r => setTimeout(r, 100));
  }
  return tracks;
}

// ─── Sync Scheduler — runs every N minutes ───
let schedulerInterval: NodeJS.Timeout | null = null;

export function startSyncScheduler() {
  const intervalMs = config.sync.intervalMinutes * 60 * 1000;

  schedulerInterval = setInterval(async () => {
    try {
      const due = db.prepare(`
        SELECT playlist_id FROM sync_state
        WHERE sync_status NOT IN ('syncing', 'playlist_deleted')
        AND next_sync_at <= unixepoch()
        AND consecutive_failures < ?
      `).all(config.sync.maxConsecutiveFailures) as any[];

      for (const row of due) {
        await syncQueue.add('sync', { playlistId: row.playlist_id }, {
          jobId: `sync-${row.playlist_id}-${Date.now()}`,
        });
      }
      if (due.length > 0) console.log(`[Sync Scheduler] Enqueued ${due.length} sync jobs`);
    } catch (err: any) {
      console.error('[Sync Scheduler] Error:', err.message);
    }
  }, Math.min(intervalMs, 5 * 60 * 1000)); // Check at most every 5 min

  console.log(`[Sync Scheduler] Started — checking every ${config.sync.intervalMinutes}min`);
}

export function stopSyncScheduler() {
  if (schedulerInterval) clearInterval(schedulerInterval);
}
