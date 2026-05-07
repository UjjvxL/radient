async function extractFromSpotifyAPI(playlistId) {
  try {
    const tokenResponse = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Origin': 'https://open.spotify.com',
        'Referer': 'https://open.spotify.com/'
      }
    });

    if (!tokenResponse.ok) {
      console.error('Token fetch failed:', tokenResponse.status, await tokenResponse.text());
      return [];
    }

    const tokenData = await tokenResponse.json();
    console.log('Got token');
    const accessToken = tokenData.accessToken;
    if (!accessToken) return [];

    const playlistResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(name,artists(name)))&limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!playlistResponse.ok) {
      console.error('Playlist fetch failed:', playlistResponse.status, await playlistResponse.text());
      return [];
    }

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

    return tracks;
  } catch (err) {
    console.error('Error:', err);
    return [];
  }
}

extractFromSpotifyAPI('37i9dQZF1DXcBWIGoYBM5M').then(tracks => console.log('Tracks found:', tracks.length, tracks.slice(0, 3)));
