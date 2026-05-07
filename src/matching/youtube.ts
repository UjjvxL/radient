/**
 * Radient — YouTube Auto-Matching Strategy
 * Searches YouTube when JioSaavn matching fails, with quality filtering.
 */
// @ts-ignore — youtube-sr has no types
import YouTube from 'youtube-sr';

const BLACKLIST = [
  /\blyrics?\b/i, /\bslowed\b/i, /\breverb\b/i, /\bsped\s*up\b/i,
  /\b8d\s*audio\b/i, /\bnightcore\b/i, /\bcover\b/i, /\btutorial\b/i,
  /\breaction\b/i, /\bkaraoke\b/i, /\bbass\s*boosted\b/i, /\bfan\s*made\b/i,
];

const OFFICIAL = [
  /official\s*(music\s*)?video/i, /official\s*audio/i,
  /\bvevo\b/i, /\btopic\b/i,
];

export interface YouTubeMatch {
  videoId: string;
  confidence: number;
  title: string;
  channel: string;
}

export async function matchOnYouTube(
  title: string, artists: string[], durationMs: number
): Promise<YouTubeMatch | null> {
  const queries = [
    `${artists[0] || ''} ${title} official audio`.trim(),
    `${artists[0] || ''} ${title}`.trim(),
  ];

  for (const q of queries) {
    try {
      const results = await YouTube.search(q, { type: 'video', limit: 6 });
      const scored = results
        .map((v: any) => scoreResult(v, title, artists, durationMs))
        .filter((s: YouTubeMatch) => s.confidence > 0.35)
        .sort((a: YouTubeMatch, b: YouTubeMatch) => b.confidence - a.confidence);

      if (scored.length > 0) return scored[0];
    } catch (err: any) {
      console.error('[YouTube] Search error:', err.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

function scoreResult(video: any, targetTitle: string, targetArtists: string[], targetDurMs: number): YouTubeMatch {
  const vTitle = video.title || '';
  const vChannel = video.channel?.name || '';
  const vDurSec = (video.duration || 0) / 1000;
  const targetDurSec = targetDurMs / 1000;
  let score = 0.5;

  // Blacklist
  for (const p of BLACKLIST) {
    if (p.test(vTitle)) { score -= 0.5; break; }
  }
  if (score <= 0) return { videoId: video.id, confidence: 0, title: vTitle, channel: vChannel };

  // Official boost
  for (const p of OFFICIAL) {
    if (p.test(vTitle) || p.test(vChannel)) { score += 0.15; break; }
  }

  // Channel matches artist
  const chLower = vChannel.toLowerCase();
  if (targetArtists.some(a => chLower.includes(a.toLowerCase()))) score += 0.15;

  // Duration proximity
  if (targetDurSec > 0 && vDurSec > 0) {
    const diff = Math.abs(targetDurSec - vDurSec);
    if (diff < 5) score += 0.15;
    else if (diff < 15) score += 0.08;
    else if (diff > 60) score -= 0.15;
  }

  // Title overlap
  if (vTitle.toLowerCase().includes(targetTitle.toLowerCase())) score += 0.10;

  return { videoId: video.id, confidence: Math.min(1, Math.max(0, score)), title: vTitle, channel: vChannel };
}
