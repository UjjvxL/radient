/**
 * Radient — Track Metadata Normalizer
 * Cleans and standardizes title/artist strings for accurate matching.
 */

/** Remove feat/ft, parentheticals, special chars; lowercase + trim */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\(feat\.?[^)]*\)/gi, '')
    .replace(/\s*\[feat\.?[^\]]*\]/gi, '')
    .replace(/\s*ft\.?\s+.*/gi, '')
    .replace(/\s*\(official[^)]*\)/gi, '')
    .replace(/\s*\(from[^)]*\)/gi, '')
    .replace(/\s*\(audio\)/gi, '')
    .replace(/\s*-\s*remix$/gi, '')
    .replace(/\s*\(remix\)/gi, '')
    .replace(/[''ʼ]/g, "'")
    .replace(/[^\w\s']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sort artists alphabetically, lowercase, strip special chars */
export function normalizeArtist(artists: string[]): string {
  return artists
    .map(a => a.toLowerCase().replace(/[^\w\s]/g, '').trim())
    .filter(Boolean)
    .sort()
    .join(',');
}

/** Detect remix/live/acoustic variants */
export function detectVariant(title: string) {
  const lower = title.toLowerCase();
  return {
    isRemix: /remix|rework|bootleg|\bedit\b/.test(lower),
    isLive: /\blive\b|concert|unplugged/.test(lower),
    isAcoustic: /acoustic|stripped/.test(lower),
  };
}

/** Jaro-Winkler string similarity (0-1) */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const matchDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1m = new Array(s1.length).fill(false);
  const s2m = new Array(s2.length).fill(false);
  let matches = 0, transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const lo = Math.max(0, i - matchDist);
    const hi = Math.min(i + matchDist + 1, s2.length);
    for (let j = lo; j < hi; j++) {
      if (s2m[j] || s1[i] !== s2[j]) continue;
      s1m[i] = s2m[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1m[i]) continue;
    while (!s2m[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / s1.length + matches / s2.length +
    (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++; else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}
