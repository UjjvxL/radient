const cheerio = require('cheerio');

// Strategy 1: Spotify Embed page
async function extractFromSpotifyEmbed(playlistId) {
  try {
    const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const tracks = [];

    // Look for track data in script tags
    $('script').each((_, el) => {
      const text = $(el).html() || '';
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

    return [...new Set(tracks)];
  } catch (err) {
    return [];
  }
}

async function run() {
  const tracks = await extractFromSpotifyEmbed('37i9dQZF1DXcBWIGoYBM5M');
  console.log('Embed tracks:', tracks);
}
run();
