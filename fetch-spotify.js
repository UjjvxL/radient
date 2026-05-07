const fs = require('fs');
async function fetchHtml() {
  const res = await fetch('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
  });
  const text = await res.text();
  fs.writeFileSync('spotify-html.txt', text);
  console.log('Saved to spotify-html.txt, length:', text.length);
}
fetchHtml();
