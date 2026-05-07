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
import './db';

// Import routers
import spotifyAuthRouter from './auth/spotify-oauth';
import importRouter from './import/controller';
import syncRouter from './sync/controller';
import { startSyncScheduler } from './sync/worker';

// Start workers (they run in-process)
import './workers';

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
app.use('/api/spotify/sync', syncRouter);

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
  ║   Redis:    ${config.redis.host}:${config.redis.port}              ║
  ║                                          ║
  ╚══════════════════════════════════════════╝
  `);

  // Start JioSaavn local API
  const apiPath = path.join(__dirname, '..', 'jiosaavn-api-local');
  const jioSaavnProcess = spawn('npx', ['tsx', '--tsconfig', 'tsconfig.json', 'run.ts'], {
    cwd: apiPath,
    env: { ...process.env, PORT: '3001' },
    stdio: 'pipe'
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

  // Start sync scheduler after server is ready
  startSyncScheduler();
});
