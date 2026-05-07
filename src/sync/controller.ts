/**
 * Radient — Sync Controller
 * API routes for enabling/disabling sync on playlists.
 */
import { Router, Request, Response } from 'express';
import db from '../db';
import { config } from '../config';

const router = Router();

// ─── POST /api/spotify/sync/enable — enable sync for a playlist ───
router.post('/enable', (req: Request, res: Response) => {
  const { playlistId } = req.body;
  if (!playlistId) return res.status(400).json({ error: 'playlistId required' });

  const playlist = db.prepare('SELECT * FROM playlists_v2 WHERE id = ?').get(playlistId) as any;
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  if (!playlist.spotify_playlist_id) return res.status(400).json({ error: 'Not a Spotify playlist' });

  db.prepare('UPDATE playlists_v2 SET sync_enabled = 1 WHERE id = ?').run(playlistId);
  db.prepare(`INSERT INTO sync_state (playlist_id, last_snapshot_id, next_sync_at, sync_status)
    VALUES (?, ?, unixepoch() + ?, 'idle')
    ON CONFLICT(playlist_id) DO UPDATE SET sync_status='idle', consecutive_failures=0, error=NULL`)
    .run(playlistId, playlist.spotify_snapshot_id, config.sync.intervalMinutes * 60);

  res.json({ success: true, message: 'Sync enabled' });
});

// ─── POST /api/spotify/sync/disable ───
router.post('/disable', (req: Request, res: Response) => {
  const { playlistId } = req.body;
  if (!playlistId) return res.status(400).json({ error: 'playlistId required' });

  db.prepare('UPDATE playlists_v2 SET sync_enabled = 0 WHERE id = ?').run(playlistId);
  db.prepare('DELETE FROM sync_state WHERE playlist_id = ?').run(playlistId);

  res.json({ success: true, message: 'Sync disabled' });
});

// ─── GET /api/spotify/sync/status ───
router.get('/status', (req: Request, res: Response) => {
  const synced = db.prepare(`
    SELECT p.id, p.name, p.spotify_playlist_id, ss.sync_status, ss.last_sync_at,
           ss.next_sync_at, ss.consecutive_failures, ss.error
    FROM playlists_v2 p
    JOIN sync_state ss ON p.id = ss.playlist_id
    WHERE p.sync_enabled = 1
  `).all();

  res.json({ syncedPlaylists: synced });
});

export default router;
