/**
 * Radient — Song Matching Engine
 * Multi-strategy matching: ISRC → Exact → Fuzzy → YouTube fallback
 */
import db from '../db';
import { config } from '../config';
import { normalizeTitle, normalizeArtist, detectVariant, jaroWinkler } from './normalizer';

export interface MatchResult {
  radientTrackId?: string;
  jiosaavnId?: string;
  youtubeVideoId?: string;
  strategy: string;
  confidence: number;
}

interface SpotifyTrackRow {
  spotify_id: string; title: string; artists: string;
  album: string; duration_ms: number; isrc: string;
}

const JIOSAAVN_API = config.jiosaavnApi;

async function searchJioSaavn(query: string, limit = 5): Promise<any[]> {
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

export async function matchTrack(spotifyTrackId: string): Promise<MatchResult> {
  const sp = db.prepare('SELECT * FROM spotify_tracks WHERE spotify_id = ?')
    .get(spotifyTrackId) as SpotifyTrackRow | undefined;
  if (!sp) throw new Error(`Spotify track ${spotifyTrackId} not cached`);

  const artists = JSON.parse(sp.artists).map((a: any) => typeof a === 'string' ? a : a.name);
  const titleNorm = normalizeTitle(sp.title);
  const artistNorm = normalizeArtist(artists);
  const variant = detectVariant(sp.title);

  // ── Strategy 1: ISRC ──
  if (sp.isrc) {
    const existing = db.prepare('SELECT id FROM tracks WHERE isrc = ?').get(sp.isrc) as any;
    if (existing) return { radientTrackId: existing.id, strategy: 'isrc', confidence: 1.0 };
  }

  // ── Strategy 2: Exact normalized match in local DB ──
  const exact = db.prepare(
    'SELECT id FROM tracks WHERE title_normalized = ? AND artists_normalized = ?'
  ).get(titleNorm, artistNorm) as any;
  if (exact) return { radientTrackId: exact.id, strategy: 'exact', confidence: 0.95 };

  // ── Strategy 3: JioSaavn search + scoring ──
  const query = `${sp.title} ${artists[0] || ''}`.trim();
  const candidates = await searchJioSaavn(query);

  if (candidates.length > 0) {
    const best = scoreCandidates(sp, candidates, titleNorm, artists, variant);
    if (best && best.confidence >= config.matching.manualReviewThreshold) {
      // Upsert canonical track
      const trackId = upsertCanonicalTrack(best.candidate, sp.isrc);
      return {
        radientTrackId: trackId,
        jiosaavnId: best.candidate.id,
        strategy: best.confidence >= 0.85 ? 'metadata' : 'fuzzy',
        confidence: best.confidence,
      };
    }
  }

  // ── Strategy 4: YouTube (delegated to youtube queue) ──
  return { strategy: 'youtube_pending', confidence: 0 };
}

function scoreCandidates(
  sp: SpotifyTrackRow, candidates: any[], titleNorm: string,
  spArtists: string[], variant: ReturnType<typeof detectVariant>
) {
  let best: { candidate: any; confidence: number } | null = null;

  for (const c of candidates) {
    const cTitle = normalizeTitle(c.name || '');
    const cArtists = (c.artists?.primary || c.artists?.all || []).map((a: any) => a.name || a);
    const cVariant = detectVariant(c.name || '');
    let score = 0;

    // Title similarity (weight: 0.45)
    score += jaroWinkler(titleNorm, cTitle) * 0.45;

    // Artist overlap (weight: 0.30)
    const spLower = spArtists.map(a => a.toLowerCase());
    const cLower = cArtists.map((a: string) => a.toLowerCase());
    const overlap = spLower.filter(a => cLower.some(ca => ca.includes(a) || a.includes(ca))).length;
    score += (overlap / Math.max(spLower.length, 1)) * 0.30;

    // Duration proximity (weight: 0.15) — ±30s tolerance
    if (sp.duration_ms && c.duration) {
      const diffSec = Math.abs(sp.duration_ms / 1000 - c.duration);
      score += Math.max(0, 1 - diffSec / 30) * 0.15;
    }

    // Variant match/penalty (weight: 0.10)
    if (variant.isRemix === cVariant.isRemix && variant.isLive === cVariant.isLive) {
      score += 0.10;
    } else {
      score -= 0.15;
    }

    score = Math.max(0, Math.min(1, score));
    if (!best || score > best.confidence) {
      best = { candidate: c, confidence: score };
    }
  }
  return best;
}

function upsertCanonicalTrack(jiosaavnTrack: any, isrc?: string): string {
  const title = jiosaavnTrack.name || '';
  const artists = (jiosaavnTrack.artists?.primary || jiosaavnTrack.artists?.all || [])
    .map((a: any) => a.name || a);
  const album = jiosaavnTrack.album?.name || '';
  const duration = jiosaavnTrack.duration ? jiosaavnTrack.duration * 1000 : null;

  const titleN = normalizeTitle(title);
  const artistN = normalizeArtist(artists);

  // Check if already exists
  const existing = db.prepare(
    'SELECT id FROM tracks WHERE title_normalized = ? AND artists_normalized = ?'
  ).get(titleN, artistN) as any;

  if (existing) return existing.id;

  const id = 'trk_' + require('crypto').randomBytes(8).toString('hex');
  db.prepare(`INSERT INTO tracks (id, title, title_normalized, artists, artists_normalized,
    album, duration_ms, isrc, sources) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, title, titleN, JSON.stringify(artists), artistN,
      album, duration, isrc || null, JSON.stringify({ jiosaavn_id: jiosaavnTrack.id }));

  return id;
}
