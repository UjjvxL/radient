/* ═══════════════════════════════════════════════
   Radient — Spotify Playlist Import Engine v2
   ═══════════════════════════════════════════════ */

const SpotifyImport = {
  init() {
    document.getElementById('btn-import-spotify').addEventListener('click', () => this.showImportModal());
    
    // Check if we just returned from Spotify Auth
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('spotify') === 'connected') {
      window.history.replaceState({}, document.title, '/');
      UI.showToast('Spotify Connected Successfully!', 'success');
      this.showImportModal();
    } else if (urlParams.get('spotify_error')) {
      UI.showToast('Spotify Error: ' + urlParams.get('spotify_error'), 'error');
      window.history.replaceState({}, document.title, '/');
    }
  },

  async showImportModal() {
    // Show loading modal first
    UI.showModal(`
      <div class="modal-header">
        <h3>Spotify Import</h3>
        <button class="modal-close" onclick="UI.hideModal()"><span class="material-symbols-rounded">close</span></button>
      </div>
      <div style="padding: 40px; text-align: center;">
        <div class="spinner"></div>
        <p style="margin-top: 15px; color: var(--text-secondary);">Connecting to Spotify...</p>
      </div>
    `);

    try {
      const res = await fetch('/auth/spotify/status');
      const status = await res.json();

      if (!status.connected) {
        this.showConnectUI();
      } else {
        await this.showPlaylistsUI(status.account.display_name);
      }
    } catch (err) {
      console.error(err);
      UI.showToast('Failed to check Spotify status', 'error');
      UI.hideModal();
    }
  },

  showConnectUI() {
    UI.showModal(`
      <div class="modal-header">
        <h3>Connect Spotify</h3>
        <button class="modal-close" onclick="UI.hideModal()"><span class="material-symbols-rounded">close</span></button>
      </div>
      <div style="text-align: center; padding: 20px 10px;">
        <span class="material-symbols-rounded" style="font-size: 64px; color: #1DB954; margin-bottom: 20px;">queue_music</span>
        <h4 style="margin-bottom: 15px; font-size: 18px;">Import your library effortlessly</h4>
        <p style="color: var(--text-secondary); margin-bottom: 30px; font-size: 14px; line-height: 1.5;">
          Connect your Spotify account to sync your playlists seamlessly. 
          Radient will intelligently match your songs so you don't lose your music.
        </p>
        <button class="modal-btn primary" onclick="window.location.href='/auth/spotify/login'" style="width: 100%; padding: 14px; font-size: 16px; background-color: #1DB954; color: black; font-weight: bold;">
          Connect with Spotify
        </button>
      </div>
    `);
  },

  async showPlaylistsUI(displayName) {
    try {
      const res = await fetch('/api/spotify/playlists');
      if (!res.ok) throw new Error('Failed to load playlists');
      const data = await res.json();

      let playlistsHtml = '';
      if (data.playlists.length === 0) {
        playlistsHtml = '<p style="text-align:center; padding: 20px; color: var(--text-secondary);">No public/private playlists found.</p>';
      } else {
        playlistsHtml = data.playlists.map(p => `
          <div class="spotify-playlist-item ${p.alreadyImported ? 'imported' : ''}" 
               style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid var(--border-medium); gap: 12px;">
            
            <input type="checkbox" id="chk-${p.id}" value="${p.id}" class="sp-chk" ${p.alreadyImported ? 'disabled' : ''} style="width: 18px; height: 18px; accent-color: var(--primary);">
            
            <img src="${p.imageUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22><rect fill=%22%231a1a1a%22 width=%221%22 height=%221%22/></svg>'}" 
                 style="width: 48px; height: 48px; border-radius: 4px; object-fit: cover;">
            
            <div style="flex: 1; overflow: hidden;">
              <div style="font-weight: bold; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                ${p.trackCount} songs ${p.alreadyImported ? '• <span style="color:#1DB954">Already Imported</span>' : ''}
              </div>
            </div>
          </div>
        `).join('');
      }

      UI.showModal(`
        <div class="modal-header" style="border-bottom: 1px solid var(--border-medium); padding-bottom: 15px;">
          <div>
            <h3 style="display:flex; align-items:center; gap:8px;">
              <span class="material-symbols-rounded" style="color:#1DB954">queue_music</span> 
              Your Spotify Playlists
            </h3>
            <p style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Logged in as ${displayName}</p>
          </div>
          <button class="modal-close" onclick="UI.hideModal()"><span class="material-symbols-rounded">close</span></button>
        </div>

        <div style="max-height: 400px; overflow-y: auto; margin: 0 -20px; padding: 0 20px;" id="sp-playlists-container">
          ${playlistsHtml}
        </div>

        <div class="modal-actions" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border-medium);">
          <button class="modal-btn cancel" onclick="fetch('/auth/spotify/disconnect',{method:'POST'}).then(()=>SpotifyImport.showImportModal())" style="font-size: 12px;">
            Disconnect
          </button>
          <button class="modal-btn primary" id="btn-start-sync" onclick="SpotifyImport.startImport()" style="flex: 1; background-color: #1DB954; color: black; font-weight: bold;">
            Import Selected
          </button>
        </div>
      `);
    } catch (err) {
      console.error(err);
      UI.showToast('Failed to load Spotify playlists', 'error');
      UI.hideModal();
    }
  },

  async startImport() {
    const checkboxes = document.querySelectorAll('.sp-chk:checked');
    const selectedIds = Array.from(checkboxes).map(c => c.value);

    if (selectedIds.length === 0) {
      UI.showToast('Please select at least one playlist', 'error');
      return;
    }

    document.getElementById('btn-start-sync').disabled = true;
    document.getElementById('btn-start-sync').textContent = 'Starting Import...';

    try {
      const res = await fetch('/api/spotify/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistIds: selectedIds })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      // Start polling the first job (for simplicity we show progress of the first selected)
      this.showProgressUI(data.jobs[0].id);

    } catch (err) {
      console.error(err);
      UI.showToast(err.message || 'Failed to start import', 'error');
      document.getElementById('btn-start-sync').disabled = false;
      document.getElementById('btn-start-sync').textContent = 'Import Selected';
    }
  },

  showProgressUI(jobId) {
    UI.showModal(`
      <div class="modal-header">
        <h3>Importing Playlist</h3>
      </div>
      <div style="padding: 20px 0; text-align: center;">
        <h4 id="sp-job-status" style="margin-bottom: 15px; text-transform: capitalize;">Queued...</h4>
        
        <div class="import-progress-bar" style="background: var(--surface-light); height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 15px;">
          <div id="sp-job-fill" style="background: #1DB954; height: 100%; width: 0%; transition: width 0.3s ease;"></div>
        </div>
        
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary);">
          <span id="sp-job-matched">0 matched</span>
          <span id="sp-job-failed">0 failed</span>
          <span id="sp-job-total">0 total</span>
        </div>
      </div>
      <div id="sp-job-tracks" style="max-height: 200px; overflow-y: auto; font-size: 12px; margin-top: 15px; border-top: 1px solid var(--border-medium); padding-top: 10px;">
        <!-- Live track status will appear here -->
      </div>
      <div class="modal-actions" style="margin-top: 20px;">
        <button class="modal-btn cancel" onclick="UI.hideModal()">Close</button>
      </div>
    `);

    this.pollJob(jobId);
  },

  async pollJob(jobId) {
    let interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/spotify/import/${jobId}`);
        if (!res.ok) return;
        const job = await res.json();

        const statusEl = document.getElementById('sp-job-status');
        const fillEl = document.getElementById('sp-job-fill');
        const matchedEl = document.getElementById('sp-job-matched');
        const failedEl = document.getElementById('sp-job-failed');
        const totalEl = document.getElementById('sp-job-total');
        const tracksEl = document.getElementById('sp-job-tracks');

        if (!statusEl) {
          clearInterval(interval); // Modal closed
          return;
        }

        statusEl.textContent = job.status === 'fetching' ? 'Fetching from Spotify...' : 
                               job.status === 'matching' ? 'Finding matches on Radient...' :
                               job.status === 'complete' ? 'Import Complete!' : job.status;

        const processed = job.matched_tracks + job.failed_tracks;
        const total = job.total_tracks || 1;
        fillEl.style.width = `${(processed / total) * 100}%`;

        matchedEl.textContent = `${job.matched_tracks} matched`;
        failedEl.textContent = `${job.failed_tracks} failed`;
        totalEl.textContent = `${job.total_tracks} total`;

        if (job.tracks && job.tracks.length > 0) {
          tracksEl.innerHTML = job.tracks.slice(-5).map(t => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span class="truncate" style="flex:1; padding-right:10px; ${t.status === 'failed' ? 'text-decoration:line-through; opacity:0.5;' : ''}">
                ${t.title} - ${JSON.parse(t.artists || '[]').map(a=>a.name||a).join(', ')}
              </span>
              <span style="color: ${t.status === 'matched' ? '#1DB954' : t.status === 'failed' ? 'var(--error)' : 'var(--text-secondary)'}">
                ${t.status}
              </span>
            </div>
          `).join('');
        }

        if (job.status === 'complete' || job.status === 'failed') {
          clearInterval(interval);
          Playlists.refreshSidebar(); // Refresh UI since a new playlist was added to DB
          if (job.status === 'complete') UI.showToast('Playlist imported successfully!', 'success');
        }

      } catch (err) {
        console.error('Polling error', err);
      }
    }, 2000); // poll every 2s
  }
};
