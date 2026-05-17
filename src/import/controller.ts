/**
 * Radient — Direct Import Controller (No Redis/BullMQ Required)
 * Handles Spotify playlist import and Screenshot import directly in-process.
 * This replaces the queue-based approach for reliability on Railway.
 */
import { Router, Request, Response } from 'express';
import { getValidSpotifyToken } from '../auth/spotify-oauth';
import { config } from '../config';
import db from '../db';
import crypto from 'crypto';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { matchOnYouTube } from '../matching/youtube';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ─── GET /api/spotify/playlists — list user's Spotify playlists ───
router.get('/playlists', async (req: Request, res: Response) => {
  try {
    const token = await getValidSpotifyToken();
    const playlists: any[] = [];
    let url: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50';

    while (url) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Spotify API: ${r.status}`);
      const data = await r.json();
      playlists.push(...data.items.map((p: any) => ({
        id: p.id, name: p.name, description: p.description,
        trackCount: p.tracks.total, imageUrl: p.images?.[0]?.url,
        owner: p.owner.display_name, isPublic: p.public,
      })));
      url = data.next;
    }

    // Mark which are already imported
    const imported = db.prepare(
      'SELECT spotify_playlist_id FROM playlists_v2 WHERE spotify_playlist_id IS NOT NULL'
    ).all() as any[];
    const importedIds = new Set(imported.map(r => r.spotify_playlist_id));

    res.json({
      playlists: playlists.map(p => ({
        ...p,
        alreadyImported: importedIds.has(p.id),
      })),
    });
  } catch (err: any) {
    console.error('[Import] Playlists error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/spotify/import — import selected playlists DIRECTLY (no Redis) ───
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { playlistIds } = req.body as { playlistIds: string[] };
    if (!playlistIds?.length) return res.status(400).json({ error: 'No playlists selected' });

    const results: any[] = [];

    for (const spId of playlistIds) {
      // Check if already imported
      const existingPl = db.prepare(
        'SELECT id FROM playlists_v2 WHERE spotify_playlist_id = ?'
      ).get(spId) as any;
      if (existingPl) {
        results.push({ playlistId: existingPl.id, status: 'already_imported' });
        continue;
      }

      const result = await importPlaylistDirect(spId);
      results.push(result);
    }

    res.json({ success: true, results });
  } catch (err: any) {
    console.error('[Import] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/import/screenshot — import from text OR screenshot ───
router.post('/screenshot', upload.single('image'), async (req: Request, res: Response) => {
  try {
    let tracks: Array<{ title: string; artists: string[] }> = [];
    const playlistName = req.body.playlistName || 'Imported Playlist';

    if (req.file) {
      // Handle Image OCR with Gemini
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Gemini API Key is missing. Screenshot OCR is unavailable.' });
      }

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      const imagePart = {
        inlineData: {
          data: req.file.buffer.toString('base64'),
          mimeType: req.file.mimetype
        }
      };

      const prompt = `
        This is a screenshot of a music playlist. Extract the songs from it.
        Return ONLY a raw JSON array of objects, with no markdown formatting or extra text.
        Each object should have "title" (string) and "artists" (array of strings).
        Example:
        [
          {"title": "Blinding Lights", "artists": ["The Weeknd"]},
          {"title": "Shape of You", "artists": ["Ed Sheeran"]}
        ]
      `;

      const result = await model.generateContent([prompt, imagePart]);
      const responseText = result.response.text();
      
      try {
        // Clean up markdown code blocks if the model ignored the instructions
        let cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        tracks = JSON.parse(cleanJson);
      } catch (err) {
        console.error('Failed to parse Gemini response:', responseText);
        return res.status(500).json({ error: 'Failed to extract songs from the image.' });
      }

    } else if (req.body.tracks) {
      // Handle text input (from the old UI logic)
      let rawTracks = req.body.tracks;
      if (typeof rawTracks === 'string') {
        try { rawTracks = JSON.parse(rawTracks); } catch { }
      }
      tracks = rawTracks;
    }

    if (!tracks?.length) {
      return res.status(400).json({ error: 'No tracks found in the input' });
    }

    const result = await importTracksFromList(tracks, playlistName);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[Screenshot Import] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/spotify/import/:id — check import status (for polling) ───
router.get('/import/:id', (req: Request, res: Response) => {
  const job = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(req.params.id) as any;
  if (!job) return res.status(404).json({ error: 'Import job not found' });
  res.json(job);
});


// ════════════════════════════════════════════════════
// DIRECT IMPORT (no Redis/BullMQ)
// ════════════════════════════════════════════════════

const JIOSAAVN_API = config.jiosaavnApi;

async function searchJioSaavn(query: string, limit = 10): Promise<any[]> {
  try {
    const res = await fetch(
      `${JIOSAAVN_API}/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`,
      { headers: { 'User-Agent': 'Radient/2.0' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data?.data?.results || [];
  } catch { return []; }
}

async function importPlaylistDirect(spotifyPlaylistId: string) {
  const token = await getValidSpotifyToken();

  // Fetch playlist metadata
  const plMeta = await fetch(
    `https://api.spotify.com/v1/playlists/${spotifyPlaylistId}?fields=name,description,snapshot_id`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then(r => r.json());

  // Paginate all tracks
  const allTracks: any[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${spotifyPlaylistId}/tracks?limit=100&fields=items(track(id,name,artists(name),album(name,images),duration_ms)),next,total`;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Spotify ${res.status}`);
    const data = await res.json();
    allTracks.push(
      ...data.items
        .filter((i: any) => i.track?.name)
        .map((i: any) => ({
          title: i.track.name,
          artists: (i.track.artists || []).map((a: any) => a.name),
          album: i.track.album?.name || '',
          albumArt: i.track.album?.images?.[0]?.url || '',
          durationMs: i.track.duration_ms || 0,
        }))
    );
    url = data.next;
    await sleep(100);
  }

  return await importTracksFromList(allTracks, plMeta.name || 'Spotify Playlist', spotifyPlaylistId);
}

async function importTracksFromList(
  tracks: Array<{ title: string; artists: string[]; album?: string; albumArt?: string; durationMs?: number }>,
  playlistName: string,
  spotifyPlaylistId?: string
) {
  // Create Radient playlist
  const playlistId = 'pl_' + crypto.randomBytes(8).toString('hex');
  db.prepare(`INSERT INTO playlists_v2 (id, user_id, name, description, spotify_playlist_id, track_count)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    playlistId, 'usr_default', playlistName, '',
    spotifyPlaylistId || null, tracks.length
  );

  // Create import job for status tracking
  const jobId = 'imp_' + crypto.randomBytes(8).toString('hex');
  db.prepare(`INSERT INTO import_jobs (id, user_id, spotify_playlist_id, playlist_id, status, total_tracks)
    VALUES (?, ?, ?, ?, 'matching', ?)`).run(
    jobId, 'usr_default', spotifyPlaylistId || 'screenshot', playlistId, tracks.length
  );

  // Match tracks in background (don't block the response)
  matchTracksInBackground(tracks, playlistId, jobId);

  return { playlistId, jobId, totalTracks: tracks.length };
}

async function matchTracksInBackground(
  tracks: Array<{ title: string; artists: string[]; album?: string; albumArt?: string; durationMs?: number }>,
  playlistId: string,
  jobId: string
) {
  let matched = 0;
  let failed = 0;

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    try {
      const query = `${t.title} ${t.artists[0] || ''}`.trim();
      const candidates = await searchJioSaavn(query, 10);

      let bestMatch: any = null;
      let bestScore = 0;

      for (const c of candidates) {
        const cName = (c.name || '').toLowerCase();
        const tName = t.title.toLowerCase();
        const cArtists = (c.artists?.primary || c.artists?.all || []).map((a: any) => (a.name || a).toLowerCase());
        const tArtists = t.artists.map(a => a.toLowerCase());

        let score = 0;

        // Title match
        if (cName === tName) score += 0.5;
        else if (cName.includes(tName) || tName.includes(cName)) score += 0.35;
        else {
          // Partial word overlap
          const cWords = new Set(cName.split(/\\s+/));
          const tWords = tName.split(/\\s+/);
          const overlap = tWords.filter(w => cWords.has(w)).length;
          score += (overlap / Math.max(tWords.length, 1)) * 0.4;
        }

        // Artist match
        const artistOverlap = tArtists.filter(a =>
          cArtists.some(ca => ca.includes(a) || a.includes(ca))
        ).length;
        score += (artistOverlap / Math.max(tArtists.length, 1)) * 0.35;

        // Duration proximity
        if (t.durationMs && c.duration) {
          const diff = Math.abs(t.durationMs / 1000 - c.duration);
          if (diff < 5) score += 0.15;
          else if (diff < 15) score += 0.10;
          else if (diff < 30) score += 0.05;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = c;
        }
      }

      if (bestMatch && bestScore >= 0.30) {
        const trackId = bestMatch.id;
        
        // ---- NEW: Resolve YouTube Video ID for primary streaming ----
        let youtubeVideoId = '';
        try {
          const ytMatch = await matchOnYouTube(bestMatch.name || t.title, bestMatch.artists?.primary?.map((a: any) => a.name) || t.artists, (bestMatch.duration || t.durationMs || 0) * 1000);
          if (ytMatch && ytMatch.confidence > 0.35) {
            youtubeVideoId = ytMatch.videoId;
          }
        } catch (ytErr) {
          console.error('[YouTube Match Error]', ytErr);
        }

        const storeStmt = db.prepare(
          `INSERT OR IGNORE INTO imported_playlist_tracks
           (playlist_id, position, jiosaavn_id, title, artists, album, album_art, duration, download_url, youtube_video_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        
        const downloadUrls = bestMatch.downloadUrl || [];
        const bestDownload = downloadUrls.find((d: any) => d.quality === '320kbps')
          || downloadUrls.find((d: any) => d.quality === '160kbps')
          || downloadUrls[downloadUrls.length - 1]
          || {};

        storeStmt.run(
          playlistId, i, trackId,
          bestMatch.name || t.title,
          JSON.stringify(bestMatch.artists?.primary || bestMatch.artists?.all || t.artists.map((a: string) => ({ name: a }))),
          bestMatch.album?.name || t.album || '',
          bestMatch.image?.[bestMatch.image.length - 1]?.url || t.albumArt || '',
          bestMatch.duration || Math.round((t.durationMs || 0) / 1000),
          bestDownload?.url || '',
          youtubeVideoId
        );
        matched++;
      } else {
        failed++;
      }

      // Update progress
      db.prepare('UPDATE import_jobs SET matched_tracks=?, failed_tracks=? WHERE id=?')
        .run(matched, failed, jobId);

    } catch (err: any) {
      console.error(`[Import] Match error for "${t.title}":`, err.message);
      failed++;
      db.prepare('UPDATE import_jobs SET failed_tracks=? WHERE id=?').run(failed, jobId);
    }

    await sleep(200); // Rate limit
  }

  // Mark complete
  db.prepare("UPDATE import_jobs SET status='complete', matched_tracks=?, failed_tracks=?, completed_at=unixepoch() WHERE id=?")
    .run(matched, failed, jobId);
  db.prepare('UPDATE playlists_v2 SET track_count=? WHERE id=?').run(matched, playlistId);

  console.log(`[Import] ✓ Job ${jobId} complete: ${matched}/${tracks.length} matched, ${failed} failed`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export default router;
