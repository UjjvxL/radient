/**
 * Radient — Import Engine Bootstrap
 * Loads the new TypeScript import/sync engine alongside the existing server.
 * Run with: npx tsx src/bootstrap.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config';

// Initialize DB (creates schema on first run)
import db from './db';

// Import routers
import spotifyAuthRouter from './auth/spotify-oauth';
import importRouter from './import/controller';
import syncRouter from './sync/controller';

// ─── Build Express app ───
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── JioSaavn Proxy (preserved from existing server.js) ───
const JIOSAAVN_API = config.jiosaavnApi;

async function fetchJSON(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Radient/2.0' } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Search routes
app.get('/api/search/songs', async (req, res) => {
  try {
    const { query, page = 0, limit = 20 } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const data = await fetchJSON(`${JIOSAAVN_API}/api/search/songs?query=${encodeURIComponent(query as string)}&page=${page}&limit=${limit}`);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/search/albums', async (req, res) => {
  try {
    const { query, page = 0, limit = 20 } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const data = await fetchJSON(`${JIOSAAVN_API}/api/search/albums?query=${encodeURIComponent(query as string)}&page=${page}&limit=${limit}`);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/search/all', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const data = await fetchJSON(`${JIOSAAVN_API}/api/search?query=${encodeURIComponent(query as string)}`);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Song/Album/Playlist detail routes
app.get('/api/songs/:id', async (req, res) => {
  try { res.json(await fetchJSON(`${JIOSAAVN_API}/api/songs/${req.params.id}`)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/songs', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Song ID required' });
    res.json(await fetchJSON(`${JIOSAAVN_API}/api/songs?id=${id}`));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/albums', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Album ID required' });
    res.json(await fetchJSON(`${JIOSAAVN_API}/api/albums?id=${id}`));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/playlists', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Playlist ID required' });
    res.json(await fetchJSON(`${JIOSAAVN_API}/api/playlists?id=${id}`));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/songs/:id/suggestions', async (req, res) => {
  try { res.json(await fetchJSON(`${JIOSAAVN_API}/api/songs/${req.params.id}/suggestions`)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── NEW: Spotify Auth, Import & Sync routes ───
app.use('/auth/spotify', spotifyAuthRouter);
app.use('/api/spotify', importRouter);
app.use('/api/import', importRouter);
app.use('/api/spotify/sync', syncRouter);

import youtubeStreamRouter from './youtube/stream';
app.use('/api/stream/youtube', youtubeStreamRouter);

// ─── Imported Playlist Tracks API ───
app.get('/api/imported-playlists/:playlistId/tracks', (req, res) => {
  try {
    const tracks = db.prepare(
      'SELECT * FROM imported_playlist_tracks WHERE playlist_id = ? ORDER BY position'
    ).all(req.params.playlistId) as any[];
    
    // Transform to frontend-compatible format
    const formatted = tracks.map((t: any) => {
      let artistsList: any[] = [];
      try { artistsList = JSON.parse(t.artists); } catch { artistsList = [{ name: t.artists }]; }
      
      return {
        id: t.jiosaavn_id,
        name: t.title,
        artists: { primary: artistsList },
        album: { name: t.album || '' },
        image: t.album_art ? [{ url: t.album_art }] : [],
        duration: t.duration || 0,
        downloadUrl: (t.download_url && t.download_url.trim()) ? [{ quality: '320kbps', url: t.download_url }] : [],
        youtube_video_id: t.youtube_video_id || ''
      };
    });
    
    res.json({ data: formatted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Imported Playlists list API ───
app.get('/api/imported-playlists', (req, res) => {
  try {
    const playlists = db.prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM imported_playlist_tracks ipt WHERE ipt.playlist_id = p.id) as matched_count
       FROM playlists_v2 p WHERE p.user_id = 'usr_default' ORDER BY p.created_at DESC`
    ).all() as any[];
    res.json({ playlists });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SPA fallback ───
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

import { spawn } from 'child_process';

// ─── Start ───
app.listen(config.port, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║                                          ║
  ║   🎵  Radient v2 — Import Engine Active  ║
  ║                                          ║
  ║   App:      http://localhost:${config.port}        ║
  ║   JioSaavn: ${JIOSAAVN_API}   ║
  ║   Spotify:  ${config.spotify.clientId ? '✓ Configured' : '✗ Not configured'}              ║
  ║                                          ║
  ╚══════════════════════════════════════════╝
  `);

  // Start JioSaavn local API
  const apiPath = path.join(__dirname, '..', 'jiosaavn-api-local');
  const jioSaavnProcess = spawn('npx', ['tsx', '--tsconfig', 'tsconfig.json', 'run.ts'], {
    cwd: apiPath,
    env: { ...process.env, PORT: '3001' },
    stdio: 'pipe',
    shell: true
  });

  jioSaavnProcess.stdout.on('data', (data) => {
    console.log(`[JioSaavn API] ${data.toString().trim()}`);
  });
  jioSaavnProcess.stderr.on('data', (data) => {
    console.error(`[JioSaavn API Error] ${data.toString().trim()}`);
  });
  jioSaavnProcess.on('close', (code) => {
    console.log(`[JioSaavn API] exited with code ${code}`);
  });

});

// ─── Background Audio Fixer ───
// This runs once on startup to fix any tracks missing download URLs
setTimeout(async () => {
  try {
    const emptyTracks = db.prepare("SELECT * FROM imported_playlist_tracks WHERE download_url = '' OR download_url IS NULL").all() as any[];
    if (emptyTracks.length > 0) {
      console.log(`[Fixer] Found ${emptyTracks.length} tracks without JioSaavn URLs. Attempting to fix...`);
      const updateStmt = db.prepare("UPDATE imported_playlist_tracks SET download_url = ? WHERE playlist_id = ? AND jiosaavn_id = ?");
      
      for (const track of emptyTracks) {
        try {
          const artists = JSON.parse(track.artists).map((a: any) => a.name).join(' ');
          const query = `${track.title} ${artists}`;
          const res = await fetchJSON(`${JIOSAAVN_API}/api/search/songs?query=${encodeURIComponent(query)}&limit=3`);
          
          if (res.data && res.data.results && res.data.results.length > 0) {
            const bestResult = res.data.results[0];
            const dlUrls = bestResult.downloadUrl;
            if (Array.isArray(dlUrls) && dlUrls.length > 0) {
              const bestUrl = dlUrls.find((u: any) => u.quality === '320kbps') || dlUrls[dlUrls.length - 1];
              if (bestUrl && bestUrl.url) {
                updateStmt.run(bestUrl.url, track.playlist_id, track.jiosaavn_id);
                console.log(`[Fixer] ✅ Fixed audio for: ${track.title}`);
              }
            }
          }
        } catch (err: any) {
          console.error(`[Fixer] Failed to fix ${track.title}:`, err.message);
        }
        await new Promise(r => setTimeout(r, 1500)); // Rate limit protection
      }
      console.log('[Fixer] Finished processing all missing tracks!');
    }
  } catch (e: any) {
    console.error('[Fixer] Error:', e.message);
  }
}, 10000); // Wait 10s for JioSaavn API to spin up
