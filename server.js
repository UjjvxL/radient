const express = require('express');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// JioSaavn API Base URL — CHANGE THIS to your own Vercel deployment!
// Deploy https://github.com/sumitkolhe/jiosaavn-api to Vercel
// and paste your deployment URL here.
// ============================================================
const JIOSAAVN_API = process.env.JIOSAAVN_API_URL || 'http://localhost:3001';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─────────────── Helper ───────────────
async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Radient/1.0' }
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ─────────────── Search Routes ───────────────
app.get('/api/search/songs', async (req, res) => {
  try {
    const { query, page = 0, limit = 20 } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const data = await fetchJSON(
      `${JIOSAAVN_API}/api/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
    );
    res.json(data);
  } catch (err) {
    console.error('Search songs error:', err.message);
    res.status(500).json({ error: 'Failed to search songs' });
  }
});

app.get('/api/search/albums', async (req, res) => {
  try {
    const { query, page = 0, limit = 20 } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const data = await fetchJSON(
      `${JIOSAAVN_API}/api/search/albums?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
    );
    res.json(data);
  } catch (err) {
    console.error('Search albums error:', err.message);
    res.status(500).json({ error: 'Failed to search albums' });
  }
});

app.get('/api/search/all', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const data = await fetchJSON(
      `${JIOSAAVN_API}/api/search?query=${encodeURIComponent(query)}`
    );
    res.json(data);
  } catch (err) {
    console.error('Search all error:', err.message);
    res.status(500).json({ error: 'Failed to search' });
  }
});

// ─────────────── Song / Album / Playlist Detail ───────────────
app.get('/api/songs/:id', async (req, res) => {
  try {
    const data = await fetchJSON(`${JIOSAAVN_API}/api/songs/${req.params.id}`);
    res.json(data);
  } catch (err) {
    console.error('Get song error:', err.message);
    res.status(500).json({ error: 'Failed to get song' });
  }
});

app.get('/api/songs', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Song ID required' });
    const data = await fetchJSON(`${JIOSAAVN_API}/api/songs?id=${id}`);
    res.json(data);
  } catch (err) {
    console.error('Get song error:', err.message);
    res.status(500).json({ error: 'Failed to get song' });
  }
});

app.get('/api/albums', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Album ID required' });
    const data = await fetchJSON(`${JIOSAAVN_API}/api/albums?id=${id}`);
    res.json(data);
  } catch (err) {
    console.error('Get album error:', err.message);
    res.status(500).json({ error: 'Failed to get album' });
  }
});

app.get('/api/playlists', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Playlist ID required' });
    const data = await fetchJSON(`${JIOSAAVN_API}/api/playlists?id=${id}`);
    res.json(data);
  } catch (err) {
    console.error('Get playlist error:', err.message);
    res.status(500).json({ error: 'Failed to get playlist' });
  }
});

// ─────────────── Song Suggestions ───────────────
app.get('/api/songs/:id/suggestions', async (req, res) => {
  try {
    const data = await fetchJSON(`${JIOSAAVN_API}/api/songs/${req.params.id}/suggestions`);
    res.json(data);
  } catch (err) {
    console.error('Suggestions error:', err.message);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// ─────────────── Spotify Playlist Import (FIXED) ───────────────
app.post('/api/import/spotify', async (req, res) => {
  try {
    const { url, trackNames } = req.body;
    let names = [];

    if (trackNames && Array.isArray(trackNames)) {
      // Method 1: User pasted track names directly
      names = trackNames.filter(n => n.trim());
    } else if (url) {
      // Method 2: Extract from Spotify URL using multiple strategies
      names = await extractSpotifyTracks(url);
    }

    if (names.length === 0) {
      return res.json({
        success: false,
        error: 'Could not extract tracks. Please paste track names manually.',
        tracks: []
      });
    }

    // Search each track on JioSaavn
    const results = [];
    const failed = [];

    for (const name of names) {
      try {
        const searchData = await fetchJSON(
          `${JIOSAAVN_API}/api/search/songs?query=${encodeURIComponent(name)}&limit=3`
        );
        const songs = searchData?.data?.results || [];
        if (songs.length > 0) {
          // Try to find the best match by comparing names
          const bestMatch = findBestMatch(name, songs);
          results.push({ query: name, song: bestMatch, matched: true });
        } else {
          failed.push(name);
          results.push({ query: name, song: null, matched: false });
        }
      } catch {
        failed.push(name);
        results.push({ query: name, song: null, matched: false });
      }
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 150));
    }

    res.json({
      success: true,
      total: names.length,
      matched: results.filter(r => r.matched).length,
      failed: failed.length,
      tracks: results,
      failedNames: failed
    });
  } catch (err) {
    console.error('Spotify import error:', err.message);
    res.status(500).json({ error: 'Import failed', tracks: [] });
  }
});

// ─────── Find the best matching song ───────
function findBestMatch(query, songs) {
  const q = query.toLowerCase().trim();
  // Check for an exact or near-exact name match
  for (const song of songs) {
    const name = (song.name || '').toLowerCase();
    if (name === q || q.includes(name) || name.includes(q)) {
      return song;
    }
  }
  return songs[0]; // Default to first result
}

// ─────── Spotify Track Extraction (Multi-Strategy) ───────
async function extractSpotifyTracks(rawUrl) {
  // Normalize the URL — handle share links, mobile links, etc.
  const playlistId = extractSpotifyPlaylistId(rawUrl);
  if (!playlistId) {
    console.error('[Spotify] Could not extract playlist ID from:', rawUrl);
    return [];
  }

  console.log(`[Spotify] Extracting playlist: ${playlistId}`);

  // Strategy 1: Spotify embed page (most reliable, no auth needed)
  let tracks = await extractFromSpotifyEmbed(playlistId);
  if (tracks.length > 0) {
    console.log(`[Spotify] ✓ Embed strategy: found ${tracks.length} tracks`);
    return tracks;
  }

  // Strategy 2: Spotify oEmbed API + page scrape combined
  tracks = await extractFromSpotifyPage(playlistId);
  if (tracks.length > 0) {
    console.log(`[Spotify] ✓ Page strategy: found ${tracks.length} tracks`);
    return tracks;
  }

  // Strategy 3: Spotify internal anonymous access token
  tracks = await extractFromSpotifyAPI(playlistId);
  if (tracks.length > 0) {
    console.log(`[Spotify] ✓ API strategy: found ${tracks.length} tracks`);
    return tracks;
  }

  console.error('[Spotify] All extraction strategies failed');
  return [];
}

// Extract playlist ID from various URL formats
function extractSpotifyPlaylistId(url) {
  try {
    // Handle: https://open.spotify.com/playlist/XXXXX
    // Handle: https://open.spotify.com/playlist/XXXXX?si=...
    // Handle: spotify:playlist:XXXXX
    // Handle: https://spotify.link/XXXXX (short links)
    
    const cleanUrl = url.trim();

    // Spotify URI format
    const uriMatch = cleanUrl.match(/spotify:playlist:([a-zA-Z0-9]+)/);
    if (uriMatch) return uriMatch[1];

    // Standard URL format
    const urlMatch = cleanUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    if (urlMatch) return urlMatch[1];

    return null;
  } catch {
    return null;
  }
}

// Strategy 1: Spotify Embed page
async function extractFromSpotifyEmbed(playlistId) {
  try {
    const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);

    const tracks = [];

    // Embed pages contain a <script id="__NEXT_DATA__"> with JSON playlist data
    const nextData = $('#__NEXT_DATA__').html();
    if (nextData) {
      try {
        const json = JSON.parse(nextData);
        const extractTracksFromJSON = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          
          // Look for track items in various possible paths
          if (obj.name && obj.artists && typeof obj.name === 'string') {
            const artistNames = Array.isArray(obj.artists)
              ? obj.artists.map(a => a.name || a).filter(Boolean).join(', ')
              : (typeof obj.artists === 'string' ? obj.artists : '');
            if (obj.name.length > 0 && obj.name.length < 200) {
              const trackStr = artistNames 
                ? `${obj.name} - ${artistNames}` 
                : obj.name;
              tracks.push(trackStr);
            }
          }

          // Recurse into arrays and objects
          if (Array.isArray(obj)) {
            obj.forEach(item => extractTracksFromJSON(item));
          } else {
            Object.values(obj).forEach(val => extractTracksFromJSON(val));
          }
        };
        extractTracksFromJSON(json);
      } catch (e) {
        console.error('[Spotify Embed] JSON parse error:', e.message);
      }
    }

    // Also try to find track data in any script tags
    if (tracks.length === 0) {
      $('script').each((_, el) => {
        const text = $(el).html() || '';
        // Look for serialized track data
        try {
          const jsonMatches = text.match(/\{[^{}]*"track"[^{}]*\}/g);
          if (jsonMatches) {
            jsonMatches.forEach(m => {
              try {
                const obj = JSON.parse(m);
                if (obj.track?.name) tracks.push(obj.track.name);
              } catch {}
            });
          }
        } catch {}
      });
    }

    return [...new Set(tracks)].slice(0, 200);
  } catch (err) {
    console.error('[Spotify Embed] Error:', err.message);
    return [];
  }
}

// Strategy 2: Spotify playlist page (og:description + structured data)
async function extractFromSpotifyPage(playlistId) {
  try {
    const url = `https://open.spotify.com/playlist/${playlistId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const tracks = [];

    // 1. Try og:description — Spotify lists track names here
    const desc = $('meta[property="og:description"]').attr('content') || 
                 $('meta[name="description"]').attr('content') || '';
    
    if (desc) {
      // Format: "Playlist · Creator · Song1, Song2, Song3, and more..."
      // or sometimes "Song1 · Song2 · Song3"
      const parts = desc.split('·').map(s => s.trim());
      
      // Skip "Playlist" and creator name, take track names
      if (parts.length >= 3) {
        const songPart = parts.slice(2).join('·').trim();
        const songNames = songPart
          .replace(/,?\s*and\s+\d+\s+more\.?$/i, '') // remove "and X more"
          .split(/[,·]/)
          .map(s => s.trim())
          .filter(s => s.length > 1 && s.length < 200);
        tracks.push(...songNames);
      }
    }

    // 2. Try JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html());
        if (json.track && Array.isArray(json.track)) {
          json.track.forEach(t => {
            if (t.name) {
              const artistName = t.byArtist?.name || '';
              tracks.push(artistName ? `${t.name} - ${artistName}` : t.name);
            }
          });
        }
        // Also check for MusicPlaylist schema
        if (json['@type'] === 'MusicPlaylist' && json.track) {
          const trackList = Array.isArray(json.track) ? json.track : [json.track];
          trackList.forEach(t => {
            const item = t.item || t;
            if (item.name) tracks.push(item.name);
          });
        }
      } catch {}
    });

    // 3. Try __NEXT_DATA__
    const nextData = $('script#__NEXT_DATA__').html();
    if (nextData && tracks.length < 3) {
      try {
        const json = JSON.parse(nextData);
        const stringified = JSON.stringify(json);
        // Extract all "name" values near "track" context
        const nameMatches = stringified.match(/"name"\s*:\s*"([^"]{2,100})"/g);
        if (nameMatches && nameMatches.length > 5) {
          nameMatches.forEach(m => {
            const match = m.match(/"name"\s*:\s*"([^"]+)"/);
            if (match && match[1]) {
              const name = match[1];
              // Filter out obvious non-track names
              if (!name.includes('http') && !name.includes('spotify') && 
                  name.length > 1 && name.length < 100) {
                tracks.push(name);
              }
            }
          });
        }
      } catch {}
    }

    return [...new Set(tracks)].slice(0, 200);
  } catch (err) {
    console.error('[Spotify Page] Error:', err.message);
    return [];
  }
}

// Strategy 3: Spotify Web API with anonymous token
async function extractFromSpotifyAPI(playlistId) {
  try {
    // Get anonymous access token from Spotify's public token endpoint
    const tokenResponse = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Origin': 'https://open.spotify.com',
        'Referer': 'https://open.spotify.com/'
      }
    });

    if (!tokenResponse.ok) return [];

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.accessToken;
    if (!accessToken) return [];

    // Fetch playlist tracks using the anonymous token
    const playlistResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(name,artists(name)))&limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!playlistResponse.ok) return [];

    const playlistData = await playlistResponse.json();
    const tracks = [];

    if (playlistData.items) {
      playlistData.items.forEach(item => {
        if (item.track && item.track.name) {
          const artists = item.track.artists?.map(a => a.name).join(', ') || '';
          tracks.push(artists ? `${item.track.name} - ${artists}` : item.track.name);
        }
      });
    }

    return tracks.slice(0, 200);
  } catch (err) {
    console.error('[Spotify API] Error:', err.message);
    return [];
  }
}

// ─────────────── Fallback: serve index.html for SPA ───────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────── Start Server ───────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║                                          ║
  ║   🎵  Radient — Music Without Limits     ║
  ║                                          ║
  ║   Running on http://localhost:${PORT}        ║
  ║   JioSaavn API: ${JIOSAAVN_API}              
  ║                                          ║
  ╚══════════════════════════════════════════╝
  `);
});
