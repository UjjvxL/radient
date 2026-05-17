/* ═══════════════════════════════════════════════
   Radient — Playlist Import Engine v3
   Spotify Connect + Screenshot Import
   ═══════════════════════════════════════════════ */

window.SpotifyImport = {
  init() {
    const importBtn = document.getElementById('btn-import-spotify');
    if (importBtn) {
      importBtn.addEventListener('click', () => this.showImportModal());
    }

    // Check if we just returned from Spotify Auth
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('spotify') === 'connected') {
      window.history.replaceState({}, document.title, '/');
      UI.showToast('Spotify Connected Successfully!', 'success');
      setTimeout(() => this.showImportModal(), 500);
    } else if (urlParams.get('spotify_error')) {
      UI.showToast('Spotify Error: ' + urlParams.get('spotify_error'), 'error');
      window.history.replaceState({}, document.title, '/');
    }
  },

  // ─── Main Import Modal ───
  async showImportModal() {
    UI.showModal(`
      <div class="modal-header">
        <h3>Import Playlist</h3>
        <button class="modal-close" onclick="UI.hideModal()"><span class="material-symbols-rounded">close</span></button>
      </div>
      <div style="padding: 10px 0;">
        <!-- Tab Selector -->
        <div style="display: flex; gap: 8px; margin-bottom: 20px;">
          <button id="tab-spotify" class="modal-btn primary" onclick="SpotifyImport.switchTab('spotify')"
                  style="flex:1; background: #1DB954; color: black; font-weight: bold; padding: 12px; font-size: 13px;">
            🎵 From Spotify
          </button>
          <button id="tab-screenshot" class="modal-btn cancel" onclick="SpotifyImport.switchTab('screenshot')"
                  style="flex:1; padding: 12px; font-size: 13px;">
            📸 From Screenshot
          </button>
          <button id="tab-text" class="modal-btn cancel" onclick="SpotifyImport.switchTab('text')"
                  style="flex:1; padding: 12px; font-size: 13px;">
            📝 From Text
          </button>
        </div>

        <!-- Tab Content -->
        <div id="import-tab-content">
          <div style="padding: 20px; text-align: center;">
            <div class="spinner"></div>
            <p style="margin-top: 15px; color: var(--text-secondary);">Loading...</p>
          </div>
        </div>
      </div>
    `);

    // Default to Spotify tab
    this.switchTab('spotify');
  },

  switchTab(tab) {
    const spotifyTab = document.getElementById('tab-spotify');
    const screenshotTab = document.getElementById('tab-screenshot');
    const textTab = document.getElementById('tab-text');

    // Reset all tabs to default state
    if (spotifyTab) { spotifyTab.className = 'modal-btn cancel'; spotifyTab.style.background = ''; spotifyTab.style.color = ''; }
    if (screenshotTab) { screenshotTab.className = 'modal-btn cancel'; screenshotTab.style.background = ''; screenshotTab.style.color = ''; }
    if (textTab) { textTab.className = 'modal-btn cancel'; textTab.style.background = ''; textTab.style.color = ''; }

    if (tab === 'spotify') {
      if (spotifyTab) { spotifyTab.className = 'modal-btn primary'; spotifyTab.style.background = '#1DB954'; spotifyTab.style.color = 'black'; }
      this.loadSpotifyTab();
    } else if (tab === 'screenshot') {
      if (screenshotTab) { screenshotTab.className = 'modal-btn primary'; screenshotTab.style.background = 'var(--primary)'; screenshotTab.style.color = 'white'; }
      this.loadScreenshotTab();
    } else if (tab === 'text') {
      if (textTab) { textTab.className = 'modal-btn primary'; textTab.style.background = 'var(--primary)'; textTab.style.color = 'white'; }
      this.loadTextTab();
    }
  },

  // ══════════════════════════════════════
  // SPOTIFY TAB
  // ══════════════════════════════════════

  async loadSpotifyTab() {
    const container = document.getElementById('import-tab-content');
    if (!container) return;

    container.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <div class="spinner"></div>
        <p style="margin-top: 15px; color: var(--text-secondary);">Connecting to Spotify...</p>
      </div>
    `;

    // Retry logic for Railway "Active preview" pages
    let status = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch('/auth/spotify/status');
        const text = await res.text();
        try {
          status = JSON.parse(text);
          break;
        } catch {
          console.warn(`[SpotifyImport] Non-JSON response (attempt ${attempt + 1}):`, text.substring(0, 100));
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err) {
        console.error('[SpotifyImport] Fetch error:', err);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!status) {
      container.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <span class="material-symbols-rounded" style="font-size: 48px; color: var(--error);">error</span>
          <h4 style="margin: 15px 0 10px;">Server Unavailable</h4>
          <p style="color: var(--text-secondary); font-size: 14px;">The server is still starting up. Please wait a moment and try again.</p>
          <button class="modal-btn primary" onclick="SpotifyImport.loadSpotifyTab()" style="margin-top: 15px;">Retry</button>
        </div>
      `;
      return;
    }

    if (!status.connected) {
      this.showConnectUI(container);
    } else {
      await this.showPlaylistsUI(container, status.account.display_name);
    }
  },

  showConnectUI(container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 10px;">
        <span class="material-symbols-rounded" style="font-size: 64px; color: #1DB954; display: block; margin-bottom: 15px;">queue_music</span>
        <h4 style="margin-bottom: 10px; font-size: 18px;">Import from Spotify</h4>
        <p style="color: var(--text-secondary); margin-bottom: 25px; font-size: 14px; line-height: 1.5;">
          Connect your Spotify account to import your playlists.
          Radient will intelligently match your songs.
        </p>
        <button class="modal-btn primary" onclick="window.location.href='/auth/spotify/login'"
                style="width: 100%; padding: 14px; font-size: 16px; background-color: #1DB954; color: black; font-weight: bold;">
          Connect with Spotify
        </button>
      </div>
    `;
  },

  async showPlaylistsUI(container, displayName) {
    try {
      const res = await fetch('/api/spotify/playlists');
      if (!res.ok) throw new Error('Failed to load playlists');
      const data = await res.json();

      let playlistsHtml = '';
      if (!data.playlists || data.playlists.length === 0) {
        playlistsHtml = '<p style="text-align:center; padding: 20px; color: var(--text-secondary);">No playlists found.</p>';
      } else {
        playlistsHtml = data.playlists.map(p => `
          <div style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid var(--border-medium); gap: 10px;">
            <input type="checkbox" id="chk-${p.id}" value="${p.id}" class="sp-chk" ${p.alreadyImported ? 'disabled' : ''}
                   style="width: 18px; height: 18px; accent-color: #1DB954;">
            <img src="${p.imageUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22><rect fill=%22%231a1a1a%22 width=%221%22 height=%221%22/></svg>'}"
                 style="width: 44px; height: 44px; border-radius: 4px; object-fit: cover;">
            <div style="flex: 1; overflow: hidden;">
              <div style="font-weight: bold; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                ${p.trackCount} songs ${p.alreadyImported ? '• <span style="color:#1DB954">Imported</span>' : ''}
              </div>
            </div>
          </div>
        `).join('');
      }

      container.innerHTML = `
        <div style="margin-bottom: 10px;">
          <p style="font-size: 12px; color: var(--text-secondary);">Logged in as <strong>${displayName}</strong></p>
        </div>
        <div style="max-height: 350px; overflow-y: auto; border: 1px solid var(--border-medium); border-radius: 8px;">
          ${playlistsHtml}
        </div>
        <div style="display: flex; gap: 8px; margin-top: 15px;">
          <button class="modal-btn cancel" onclick="fetch('/auth/spotify/disconnect',{method:'POST'}).then(()=>SpotifyImport.loadSpotifyTab())" style="font-size: 12px;">
            Disconnect
          </button>
          <button class="modal-btn primary" id="btn-start-import" onclick="SpotifyImport.startSpotifyImport()"
                  style="flex: 1; background-color: #1DB954; color: black; font-weight: bold;">
            Import Selected
          </button>
        </div>
      `;
    } catch (err) {
      console.error(err);
      container.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <span class="material-symbols-rounded" style="font-size: 48px; color: var(--error);">error</span>
          <p style="margin-top: 10px; color: var(--text-secondary);">${err.message}</p>
          <button class="modal-btn primary" onclick="SpotifyImport.loadSpotifyTab()" style="margin-top: 15px;">Retry</button>
        </div>
      `;
    }
  },

  async startSpotifyImport() {
    const checkboxes = document.querySelectorAll('.sp-chk:checked');
    const selectedIds = Array.from(checkboxes).map(c => c.value);

    if (selectedIds.length === 0) {
      UI.showToast('Please select at least one playlist', 'error');
      return;
    }

    const btn = document.getElementById('btn-start-import');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing...'; }

    try {
      const res = await fetch('/api/spotify/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistIds: selectedIds })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      // Show progress for the first job
      const firstResult = data.results?.[0];
      if (firstResult?.jobId) {
        this.showProgressUI(firstResult.jobId);
      } else {
        UI.showToast('Import started!', 'success');
        UI.hideModal();
        Playlists.refreshSidebar();
      }
    } catch (err) {
      console.error(err);
      UI.showToast(err.message || 'Failed to start import', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Import Selected'; }
    }
  },

  // ══════════════════════════════════════
  // SCREENSHOT TAB
  // ══════════════════════════════════════

  loadScreenshotTab() {
    const container = document.getElementById('import-tab-content');
    if (!container) return;

    container.innerHTML = `
      <div style="text-align: center; padding: 10px;">
        <span class="material-symbols-rounded" style="font-size: 48px; color: var(--primary); display: block; margin-bottom: 10px;">photo_camera</span>
        <h4 style="margin-bottom: 8px;">Import from Screenshot</h4>
        <p style="color: var(--text-secondary); font-size: 13px; line-height: 1.5; margin-bottom: 20px;">
          Upload a clear screenshot of your playlist showing the song names and artists.<br>
          Our AI will automatically extract the songs and build a playlist for you!
        </p>

        <input type="file" id="screenshot-file-input" accept="image/*"
               style="width: 100%; margin-bottom: 10px; padding: 12px; background: var(--surface-light);
                      color: var(--text-primary); border: 1px dashed var(--border-medium); border-radius: 8px;
                      font-size: 13px; font-family: 'Inter', sans-serif;">

        <input type="text" id="screenshot-playlist-name" placeholder="Playlist name (optional)"
               style="width: 100%; margin-top: 10px; padding: 10px 12px; background: var(--surface-light);
                      color: var(--text-primary); border: 1px solid var(--border-medium); border-radius: 8px;
                      font-size: 13px; font-family: 'Inter', sans-serif;">

        <button class="modal-btn primary" id="btn-screenshot-import" onclick="SpotifyImport.startScreenshotImport()"
                style="width: 100%; margin-top: 15px; padding: 14px; font-size: 15px; font-weight: bold;">
          🎵 Import from Image
        </button>
      </div>
    `;
  },

  async startScreenshotImport() {
    const fileInput = document.getElementById('screenshot-file-input');
    const nameInput = document.getElementById('screenshot-playlist-name');
    const btn = document.getElementById('btn-screenshot-import');

    if (!fileInput || !fileInput.files[0]) {
      UI.showToast('Please select an image file', 'error');
      return;
    }

    const playlistName = nameInput?.value?.trim() || 'Imported Playlist';

    if (btn) { btn.disabled = true; btn.textContent = 'Analyzing image...'; }

    try {
      const formData = new FormData();
      formData.append('image', fileInput.files[0]);
      formData.append('playlistName', playlistName);

      const res = await fetch('/api/import/screenshot', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      // Show progress
      if (data.jobId) {
        this.showProgressUI(data.jobId);
      } else {
        UI.showToast('Import started!', 'success');
        UI.hideModal();
      }
    } catch (err) {
      console.error(err);
      UI.showToast(err.message || 'Failed to import', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '🎵 Import from Image'; }
    }
  },

  // ══════════════════════════════════════
  // TEXT TAB
  // ══════════════════════════════════════

  loadTextTab() {
    const container = document.getElementById('import-tab-content');
    if (!container) return;

    container.innerHTML = `
      <div style="text-align: left; padding: 10px;">
        <h4 style="margin-bottom: 8px;">Import from Text</h4>
        <p style="color: var(--text-secondary); font-size: 13px; line-height: 1.5; margin-bottom: 15px;">
          Paste a list of songs (one per line). Format: <b>Song Name - Artist</b>
        </p>

        <textarea id="text-import-input" placeholder="Example:\nBlinding Lights - The Weeknd\nShape of You - Ed Sheeran"
               style="width: 100%; height: 120px; margin-bottom: 10px; padding: 12px; background: var(--surface-light);
                      color: var(--text-primary); border: 1px solid var(--border-medium); border-radius: 8px;
                      font-size: 13px; font-family: 'Inter', sans-serif; resize: vertical;"></textarea>

        <input type="text" id="text-playlist-name" placeholder="Playlist name (optional)"
               style="width: 100%; margin-top: 10px; padding: 10px 12px; background: var(--surface-light);
                      color: var(--text-primary); border: 1px solid var(--border-medium); border-radius: 8px;
                      font-size: 13px; font-family: 'Inter', sans-serif;">

        <button class="modal-btn primary" id="btn-text-import" onclick="SpotifyImport.startTextImport()"
                style="width: 100%; margin-top: 15px; padding: 14px; font-size: 15px; font-weight: bold;">
          📝 Import from Text
        </button>
      </div>
    `;
  },

  async startTextImport() {
    const textInput = document.getElementById('text-import-input');
    const nameInput = document.getElementById('text-playlist-name');
    const btn = document.getElementById('btn-text-import');

    const rawText = textInput?.value?.trim();
    if (!rawText) {
      UI.showToast('Please enter some text', 'error');
      return;
    }

    const playlistName = nameInput?.value?.trim() || 'Imported Playlist';

    // Parse the text into an array of { title, artists: [] }
    const tracks = [];
    const lines = rawText.split('\\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Simple parsing: split by '-' or 'by'
      let title = trimmed;
      let artist = 'Unknown Artist';
      
      if (trimmed.includes(' - ')) {
        const parts = trimmed.split(' - ');
        title = parts[0].trim();
        artist = parts[1].trim();
      } else if (trimmed.toLowerCase().includes(' by ')) {
        const parts = trimmed.split(/ by /i);
        title = parts[0].trim();
        artist = parts[1].trim();
      }

      // Remove numbers if it's a numbered list (e.g. "1. Song - Artist")
      title = title.replace(/^\\d+\\.\\s*/, '').trim();
      
      tracks.push({ title, artists: [artist] });
    }

    if (tracks.length === 0) {
      UI.showToast('No valid songs found in text', 'error');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Processing text...'; }

    try {
      const res = await fetch('/api/import/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistName: playlistName,
          tracks: tracks
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      // Show progress
      if (data.jobId) {
        this.showProgressUI(data.jobId);
      } else {
        UI.showToast('Import started!', 'success');
        UI.hideModal();
      }
    } catch (err) {
      console.error(err);
      UI.showToast(err.message || 'Failed to import', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '📝 Import from Text'; }
    }
  },

  // ══════════════════════════════════════
  // PROGRESS UI (shared)
  // ══════════════════════════════════════

  showProgressUI(jobId) {
    UI.showModal(`
      <div class="modal-header">
        <h3>Importing Playlist</h3>
      </div>
      <div style="padding: 20px 0; text-align: center;">
        <h4 id="sp-job-status" style="margin-bottom: 15px;">Matching songs...</h4>

        <div style="background: var(--surface-light); height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 15px;">
          <div id="sp-job-fill" style="background: #1DB954; height: 100%; width: 0%; transition: width 0.3s ease;"></div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary);">
          <span id="sp-job-matched">0 matched</span>
          <span id="sp-job-failed">0 failed</span>
          <span id="sp-job-total">0 total</span>
        </div>
      </div>
      <div class="modal-actions" style="margin-top: 20px;">
        <button class="modal-btn cancel" onclick="UI.hideModal()">Close</button>
      </div>
    `);

    this.pollJob(jobId);
  },

  async pollJob(jobId) {
    const poll = async () => {
      try {
        const res = await fetch('/api/spotify/import/' + jobId);
        if (!res.ok) return;
        const job = await res.json();

        const statusEl = document.getElementById('sp-job-status');
        const fillEl = document.getElementById('sp-job-fill');
        const matchedEl = document.getElementById('sp-job-matched');
        const failedEl = document.getElementById('sp-job-failed');
        const totalEl = document.getElementById('sp-job-total');

        if (!statusEl) return; // Modal closed

        const processed = (job.matched_tracks || 0) + (job.failed_tracks || 0);
        const total = job.total_tracks || 1;

        statusEl.textContent = job.status === 'matching' ? 'Finding matches...' :
                               job.status === 'complete' ? 'Import Complete! ✓' :
                               job.status === 'failed' ? 'Import Failed' : job.status;

        fillEl.style.width = ((processed / total) * 100) + '%';
        matchedEl.textContent = (job.matched_tracks || 0) + ' matched';
        failedEl.textContent = (job.failed_tracks || 0) + ' failed';
        totalEl.textContent = (job.total_tracks || 0) + ' total';

        if (job.status === 'complete' || job.status === 'failed') {
          if (job.status === 'complete') {
            UI.showToast('Playlist imported! ' + (job.matched_tracks || 0) + ' songs matched.', 'success');
          }
          // Refresh sidebar to show new playlist
          if (typeof Playlists !== 'undefined') Playlists.refreshSidebar();
          return; // Stop polling
        }

        // Keep polling
        setTimeout(poll, 2000);
      } catch (err) {
        console.error('Polling error:', err);
        setTimeout(poll, 3000);
      }
    };

    poll();
  },

  // ══════════════════════════════════════
  // VIEW IMPORTED PLAYLIST
  // ══════════════════════════════════════

  async viewImportedPlaylist(playlistId, playlistName) {
    UI.currentPage = 'imported-playlist';
    UI.currentData = { id: playlistId };
    UI.updateNavLinks();

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <div class="spinner"></div>
        <p style="margin-top: 15px; color: var(--text-secondary);">Loading playlist...</p>
      </div>
    `;

    try {
      const res = await fetch('/api/imported-playlists/' + playlistId + '/tracks');
      if (!res.ok) throw new Error('Failed to load tracks');
      const data = await res.json();
      const tracks = data.data || [];

      content.innerHTML = `
        <div class="fade-in">
          <div class="detail-header">
            <div class="detail-cover playlist-cover" style="background: linear-gradient(135deg, #1DB954, #0d8c3f);">
              <span class="material-symbols-rounded">cloud_done</span>
            </div>
            <div class="detail-info">
              <span class="detail-type">Imported Playlist</span>
              <h1 class="detail-title">${playlistName || 'Imported Playlist'}</h1>
              <div class="detail-meta">
                <span>${tracks.length} songs</span>
              </div>
            </div>
          </div>

          <div class="detail-actions">
            ${tracks.length > 0 ? `
              <button class="btn-play-large" style="background: #1DB954; box-shadow: 0 8px 24px rgba(29, 185, 84, 0.35);"
                      onclick="SpotifyImport.playImportedPlaylist('${playlistId}')">
                <span class="material-symbols-rounded">play_arrow</span>
              </button>
            ` : ''}
          </div>

          ${tracks.length > 0 ? `
            <div class="track-list">
              ${tracks.map((track, i) => UI.renderTrackItem(track, i, tracks)).join('')}
            </div>
          ` : `
            <div class="empty-state">
              <span class="material-symbols-rounded">library_music</span>
              <h4>No matched songs</h4>
              <p>The import may still be processing, or no matches were found.</p>
            </div>
          `}
        </div>
      `;
    } catch (err) {
      console.error(err);
      content.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">error</span>
          <h4>Failed to load playlist</h4>
          <p>${err.message}</p>
        </div>
      `;
    }
  },

  async playImportedPlaylist(playlistId) {
    try {
      const res = await fetch('/api/imported-playlists/' + playlistId + '/tracks');
      if (!res.ok) return;
      const data = await res.json();
      const tracks = (data.data || []).map(t => Player.normalizeTrack(t));
      if (tracks.length > 0) {
        Player.play(tracks[0], tracks, 0);
      }
    } catch (err) {
      console.error(err);
    }
  }
};
