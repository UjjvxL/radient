const fs = require('fs');
const path = require('path');
const YouTube = require('youtube-sr').default;
const fetch = require('isomorphic-unfetch');
const spotify = require('spotify-url-info')(fetch);

const SERVER_URL = 'https://radient-production.up.railway.app';

async function getPlaylistTracks(link) {
  console.log(`\n📦 Fetching Spotify Playlist...`);
  
  try {
    const data = await spotify.getTracks(link);
    const meta = await spotify.getData(link);
    
    const tracks = data.map(t => ({
      title: t.name,
      artists: t.artist ? t.artist.split(',').map(a => a.trim()) : [],
      album: meta?.name || 'Spotify Playlist',
      albumArt: meta?.coverArt?.sources?.[0]?.url || meta?.images?.[0]?.url || '',
      durationMs: t.duration
    }));
    
    console.log(`✅ Found ${tracks.length} tracks in "${meta?.name || 'Playlist'}"`);
    return { name: meta?.name || 'Spotify Playlist', tracks };
  } catch (err) {
    throw new Error(`Failed to fetch from Spotify: ${err.message}`);
  }
}

async function matchOnYouTube(t) {
  const queries = [
    `${t.artists[0] || ''} ${t.title} official audio`.trim(),
    `${t.artists[0] || ''} ${t.title}`.trim()
  ];

  for (const q of queries) {
    try {
      const results = await YouTube.search(q, { type: 'video', limit: 5 });
      if (results.length > 0) {
        return results[0].id; 
      }
    } catch (e) { }
  }
  return null;
}

async function runBridge() {
  const args = process.argv.slice(2);
  const link = args[0];
  
  if (!link || !link.includes('spotify.com/playlist/')) {
    console.error('❌ Please provide a valid Spotify Playlist Link.');
    console.log('Usage: node scripts/radient-bridge.js "https://open.spotify.com/playlist/..."');
    process.exit(1);
  }

  try {
    const { name, tracks } = await getPlaylistTracks(link);

    console.log('\n🔍 Matching songs on YouTube using your local residential IP (bypassing cloud blocks)...');
    
    const matchedTracks = [];
    let failed = 0;

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      process.stdout.write(`[${i+1}/${tracks.length}] Matching "${t.title}"... `);
      
      const ytId = await matchOnYouTube(t);
      if (ytId) {
        // Also get JioSaavn 320kbps URL so it doesn't rely on YouTube streaming
        let downloadUrl = '';
        try {
          const query = `${t.title} ${t.artists.join(' ')}`;
          const res = await fetch(`https://radient-production.up.railway.app/api/search/songs?query=${encodeURIComponent(query)}&limit=3`);
          const data = await res.json();
          if (data.data && data.data.results && data.data.results.length > 0) {
            const dlUrls = data.data.results[0].downloadUrl;
            if (Array.isArray(dlUrls) && dlUrls.length > 0) {
              const bestUrl = dlUrls.find((u: any) => u.quality === '320kbps') || dlUrls[dlUrls.length - 1];
              if (bestUrl && bestUrl.url) downloadUrl = bestUrl.url;
            }
          }
        } catch (e) { }

        process.stdout.write(`✅ Found (YT: ${ytId}${downloadUrl ? ', HQ Audio: Yes' : ''})\n`);
        matchedTracks.push({
          title: t.title,
          artists: t.artists,
          album: t.album,
          albumArt: t.albumArt,
          duration: Math.round(t.durationMs / 1000),
          youtubeVideoId: ytId,
          downloadUrl: downloadUrl // Send this to the server
        });
      } else {
        process.stdout.write(`❌ Failed\n`);
        failed++;
      }
      await new Promise(r => setTimeout(r, 800));
    }

    console.log(`\n🚀 Sending ${matchedTracks.length} successfully matched tracks to your live Railway server...`);

    const res = await fetch(`${SERVER_URL}/api/import/bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistName: name, tracks: matchedTracks })
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`\n🎉 SUCCESS! Your playlist is now live on Radient.`);
      console.log(`Open ${SERVER_URL} on your phone to stream it!`);
    } else {
      const err = await res.text();
      console.error(`\n❌ Failed to sync to server: ${err}`);
    }

  } catch (err) {
    console.error('\n❌ Fatal Error:', err.message);
  }
}

runBridge();
