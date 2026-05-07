const url = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'; // Today's Top Hits

async function test() {
  console.log('Testing Spotify import...');
  try {
    const res = await fetch('http://localhost:3000/api/import/spotify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    console.log('Result:', JSON.stringify(data, null, 2).slice(0, 500) + '...');
    if (data.success && data.tracks && data.tracks.length > 0) {
      console.log('✅ Spotify import works! Found', data.matched, 'tracks.');
    } else {
      console.error('❌ Failed to extract or match tracks.', data);
    }
  } catch (err) {
    console.error('❌ Error during fetch:', err);
  }
}

test();
