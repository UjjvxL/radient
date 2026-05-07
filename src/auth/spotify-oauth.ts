/**
 * Radient — Spotify OAuth 2.0 (PKCE Flow)
 * Handles login, callback, token exchange, and auto-refresh.
 */
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { config } from '../config';
import { encrypt, decrypt } from './token-store';
import db from '../db';

const router = Router();

// ─── PKCE helpers ───
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// ─── GET /auth/spotify/login ───
router.get('/login', (req: Request, res: Response) => {
  if (!config.spotify.clientId) {
    return res.status(500).json({ error: 'SPOTIFY_CLIENT_ID not configured' });
  }

  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString('hex');

  res.cookie('spotify_auth', JSON.stringify({ verifier, state }), {
    httpOnly: true, maxAge: 600000, sameSite: 'lax',
  });

  const params = new URLSearchParams({
    client_id: config.spotify.clientId,
    response_type: 'code',
    redirect_uri: config.spotify.redirectUri,
    scope: config.spotify.scopes.join(' '),
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

// ─── GET /auth/spotify/callback ───
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) return res.redirect(`/?spotify_error=${error}`);

    const cookie = JSON.parse(req.cookies?.spotify_auth || '{}');
    if (state !== cookie.state) return res.status(403).send('State mismatch — possible CSRF');

    // Exchange code for tokens
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.spotify.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.spotify.redirectUri,
        code_verifier: cookie.verifier,
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    // Fetch Spotify profile
    const profile = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }).then(r => r.json());

    // Store encrypted
    const stmt = db.prepare(`
      INSERT INTO spotify_accounts (user_id, spotify_user_id, display_name,
        access_token_enc, refresh_token_enc, token_expires_at, scopes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(spotify_user_id) DO UPDATE SET
        access_token_enc = excluded.access_token_enc,
        refresh_token_enc = excluded.refresh_token_enc,
        token_expires_at = excluded.token_expires_at,
        display_name = excluded.display_name
    `);

    stmt.run(
      'usr_default', profile.id, profile.display_name,
      encrypt(tokens.access_token), encrypt(tokens.refresh_token),
      Math.floor(Date.now() / 1000) + tokens.expires_in,
      config.spotify.scopes.join(' ')
    );

    res.clearCookie('spotify_auth');
    res.redirect('/?spotify=connected');
  } catch (err: any) {
    console.error('[SpotifyAuth] Callback error:', err.message);
    res.redirect(`/?spotify_error=${encodeURIComponent(err.message)}`);
  }
});

// ─── GET /auth/spotify/status ───
router.get('/status', (req: Request, res: Response) => {
  const account = db.prepare(
    'SELECT spotify_user_id, display_name, linked_at FROM spotify_accounts WHERE user_id = ?'
  ).get('usr_default') as any;

  res.json({ connected: !!account, account: account || null });
});

// ─── POST /auth/spotify/disconnect ───
router.post('/disconnect', (req: Request, res: Response) => {
  db.prepare('DELETE FROM spotify_accounts WHERE user_id = ?').run('usr_default');
  res.json({ success: true });
});

// ─── Helper: get a valid access token (auto-refresh) ───
export async function getValidSpotifyToken(): Promise<string> {
  const account = db.prepare(
    'SELECT * FROM spotify_accounts WHERE user_id = ? ORDER BY linked_at DESC LIMIT 1'
  ).get('usr_default') as any;

  if (!account) throw new Error('No Spotify account linked');

  // If token still valid (with 60s buffer)
  if (account.token_expires_at > Math.floor(Date.now() / 1000) + 60) {
    return decrypt(account.access_token_enc);
  }

  // Refresh token
  const refreshToken = decrypt(account.refresh_token_enc);
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.spotify.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const tokens = await res.json();
  if (tokens.error) throw new Error(`Token refresh failed: ${tokens.error}`);

  db.prepare(`UPDATE spotify_accounts SET
    access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ?
    WHERE id = ?`
  ).run(
    encrypt(tokens.access_token),
    encrypt(tokens.refresh_token || refreshToken),
    Math.floor(Date.now() / 1000) + tokens.expires_in,
    account.id
  );

  return tokens.access_token;
}

export default router;
