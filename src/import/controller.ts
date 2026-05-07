/**
 * Radient — Import Controller
 * API routes for Spotify playlist import.
 */
import { Router, Request, Response } from 'express';
import { getValidSpotifyToken } from '../auth/spotify-oauth';
import { importQueue } from '../queues';
import db from '../db';

const router = Router();

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

// ─── POST /api/spotify/import — import selected playlists ───
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { playlistIds } = req.body as { playlistIds: string[] };
    if (!playlistIds?.length) return res.status(400).json({ error: 'No playlists selected' });

    const jobs: any[] = [];

    for (const spId of playlistIds) {
      // Idempotency: skip if already importing
      const existing = db.prepare(
        "SELECT id FROM import_jobs WHERE spotify_playlist_id = ? AND status IN ('queued','fetching','matching')"
      ).get(spId) as any;
      if (existing) { jobs.push({ id: existing.id, status: 'already_queued' }); continue; }

      // Create import job record
      const jobId = 'imp_' + require('crypto').randomBytes(8).toString('hex');
      db.prepare(
        'INSERT INTO import_jobs (id, user_id, spotify_playlist_id) VALUES (?, ?, ?)'
      ).run(jobId, 'usr_default', spId);

      // Enqueue
      await importQueue.add('import-playlist', {
        importJobId: jobId,
        spotifyPlaylistId: spId,
      }, { jobId });

      jobs.push({ id: jobId, spotifyPlaylistId: spId, status: 'queued' });
    }

    res.json({ success: true, jobs });
  } catch (err: any) {
    console.error('[Import] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/spotify/import/:id — check import status ───
router.get('/import/:id', (req: Request, res: Response) => {
  const job = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(req.params.id) as any;
  if (!job) return res.status(404).json({ error: 'Import job not found' });

  // Get per-track statuses
  const mappings = job.playlist_id ? db.prepare(`
    SELECT tm.status, tm.confidence, tm.match_strategy, st.title, st.artists
    FROM playlist_tracks_v2 pt
    JOIN track_mappings tm ON pt.track_mapping_id = tm.id
    JOIN spotify_tracks st ON tm.spotify_track_id = st.spotify_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position
  `).all(job.playlist_id) : [];

  res.json({ ...job, tracks: mappings });
});

export default router;
