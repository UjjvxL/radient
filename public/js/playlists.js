/* ═══════════════════════════════════════════════
   Radient — Playlist Management
   ═══════════════════════════════════════════════ */

const Playlists = {
  init() {
    document.getElementById('btn-create-playlist').addEventListener('click', () => this.showCreateModal());
  },

  // ─── Create Playlist Modal ───

  showCreateModal() {
    const html = `
      <div class="modal-header">
        <h3>Create Playlist</h3>
        <button class="modal-close" onclick="UI.hideModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <input type="text" class="modal-input" id="new-playlist-name" 
             placeholder="Playlist name" maxlength="100" autofocus>
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick="UI.hideModal()">Cancel</button>
        <button class="modal-btn primary" id="btn-confirm-create" onclick="Playlists.confirmCreate()">
          Create
        </button>
      </div>
    `;
    UI.showModal(html);

    // Enter key to create
    setTimeout(() => {
      const input = document.getElementById('new-playlist-name');
      if (input) {
        input.focus();
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.confirmCreate();
        });
      }
    }, 100);
  },

  async confirmCreate() {
    const input = document.getElementById('new-playlist-name');
    const name = input?.value?.trim();
    if (!name) {
      input.style.borderColor = 'var(--error)';
      return;
    }

    const playlist = await RadientDB.createPlaylist(name);
    UI.hideModal();
    UI.showToast(`Playlist "${name}" created!`, 'success');
    this.refreshSidebar();

    // Navigate to the new playlist
    UI.navigate('playlist', { id: playlist.id });
  },

  // ─── Delete Playlist ───

  showDeleteConfirm(playlistId, playlistName) {
    const html = `
      <div class="modal-header">
        <h3>Delete Playlist?</h3>
        <button class="modal-close" onclick="UI.hideModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 14px;">
        Are you sure you want to delete <strong>"${playlistName}"</strong>? This cannot be undone.
      </p>
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick="UI.hideModal()">Cancel</button>
        <button class="modal-btn primary" style="background: var(--error); box-shadow: none;"
                onclick="Playlists.confirmDelete('${playlistId}')">
          Delete
        </button>
      </div>
    `;
    UI.showModal(html);
  },

  async confirmDelete(playlistId) {
    await RadientDB.deletePlaylist(playlistId);
    UI.hideModal();
    UI.showToast('Playlist deleted', 'success');
    this.refreshSidebar();
    UI.navigate('library');
  },

  // ─── Rename Playlist ───

  showRenameModal(playlistId, currentName) {
    const html = `
      <div class="modal-header">
        <h3>Rename Playlist</h3>
        <button class="modal-close" onclick="UI.hideModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <input type="text" class="modal-input" id="rename-playlist-input" 
             value="${currentName}" maxlength="100">
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick="UI.hideModal()">Cancel</button>
        <button class="modal-btn primary" onclick="Playlists.confirmRename('${playlistId}')">
          Rename
        </button>
      </div>
    `;
    UI.showModal(html);

    setTimeout(() => {
      const input = document.getElementById('rename-playlist-input');
      if (input) {
        input.focus();
        input.select();
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.confirmRename(playlistId);
        });
      }
    }, 100);
  },

  async confirmRename(playlistId) {
    const input = document.getElementById('rename-playlist-input');
    const name = input?.value?.trim();
    if (!name) return;

    await RadientDB.updatePlaylist(playlistId, { name });
    UI.hideModal();
    UI.showToast('Playlist renamed', 'success');
    this.refreshSidebar();

    // Refresh current view if viewing this playlist
    if (UI.currentPage === 'playlist' && UI.currentData?.id === playlistId) {
      UI.navigate('playlist', { id: playlistId });
    }
  },

  // ─── Add Track to Playlist (context menu) ───

  async showAddToPlaylistMenu(track, x, y) {
    const playlists = await RadientDB.getPlaylists();

    let menuHtml = `
      <div class="context-menu-item" onclick="Playlists.quickCreateAndAdd()" data-track='${JSON.stringify(track).replace(/'/g, "\\'")}'>
        <span class="material-symbols-rounded">add</span>
        New Playlist
      </div>
    `;

    if (playlists.length > 0) {
      menuHtml += '<div class="context-menu-divider"></div>';
      playlists.forEach(pl => {
        menuHtml += `
          <div class="context-menu-item" onclick="Playlists.addTrackFromMenu('${pl.id}')">
            <span class="material-symbols-rounded">queue_music</span>
            ${pl.name}
          </div>
        `;
      });
    }

    // Show context menu
    const menu = document.getElementById('context-menu');
    menu.innerHTML = menuHtml;
    menu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 300)}px`;
    menu.classList.add('active');
    menu._pendingTrack = track;

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', Playlists._closeMenu, { once: true });
    }, 10);
  },

  _closeMenu() {
    const menu = document.getElementById('context-menu');
    menu.classList.remove('active');
  },

  async addTrackFromMenu(playlistId) {
    const menu = document.getElementById('context-menu');
    const track = menu._pendingTrack;
    menu.classList.remove('active');

    if (!track) return;

    try {
      await RadientDB.addTrackToPlaylist(playlistId, Player.normalizeTrack(track));
      UI.showToast('Added to playlist', 'success');
    } catch (err) {
      UI.showToast('Failed to add', 'error');
    }
  },

  quickCreateAndAdd() {
    const menu = document.getElementById('context-menu');
    const track = menu._pendingTrack;
    menu.classList.remove('active');

    if (!track) return;

    // Show create modal, then add track
    this._pendingTrackForNew = track;
    const html = `
      <div class="modal-header">
        <h3>Create Playlist</h3>
        <button class="modal-close" onclick="UI.hideModal()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <input type="text" class="modal-input" id="new-playlist-name" 
             placeholder="Playlist name" maxlength="100" autofocus>
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick="UI.hideModal()">Cancel</button>
        <button class="modal-btn primary" onclick="Playlists.confirmCreateAndAdd()">
          Create & Add
        </button>
      </div>
    `;
    UI.showModal(html);
    setTimeout(() => document.getElementById('new-playlist-name')?.focus(), 100);
  },

  async confirmCreateAndAdd() {
    const input = document.getElementById('new-playlist-name');
    const name = input?.value?.trim();
    if (!name) return;

    const track = this._pendingTrackForNew;
    const playlist = await RadientDB.createPlaylist(name, track ? [Player.normalizeTrack(track)] : []);
    UI.hideModal();
    UI.showToast(`Added to "${name}"`, 'success');
    this.refreshSidebar();
  },

  // ─── Sidebar Refresh ───

  async refreshSidebar() {
    const container = document.getElementById('sidebar-playlists');
    const playlists = await RadientDB.getPlaylists();

    // Also fetch server-side imported playlists
    let importedPlaylists = [];
    try {
      const res = await fetch('/api/imported-playlists');
      if (res.ok) {
        const data = await res.json();
        importedPlaylists = (data.playlists || []).filter(p => p.matched_count > 0);
      }
    } catch {}

    const hasLocal = playlists.length > 0;
    const hasImported = importedPlaylists.length > 0;

    if (!hasLocal && !hasImported) {
      container.innerHTML = `
        <p style="padding: 16px; font-size: 12px; color: var(--text-tertiary);">
          No playlists yet. Create one!
        </p>
      `;
      return;
    }

    let html = '';

    // Server-side imported playlists
    if (hasImported) {
      html += '<div class="sidebar-section-title">Imported Playlists</div>';
      html += importedPlaylists.map(pl => `
        <div class="playlist-link ${UI.currentPage === 'imported-playlist' && UI.currentData?.id === pl.id ? 'active' : ''}"
             onclick="SpotifyImport.viewImportedPlaylist('${pl.id}', '${pl.name.replace(/'/g, "\\\\'")}')"
             data-playlist-id="${pl.id}">
          <span class="material-symbols-rounded" style="color: #1DB954;">cloud_done</span>
          ${pl.name}
          <span style="font-size: 10px; color: var(--text-tertiary); margin-left: auto;">${pl.matched_count}</span>
        </div>
      `).join('');
    }

    // Local playlists
    if (hasLocal) {
      html += '<div class="sidebar-section-title">Your Playlists</div>';
      html += playlists.map(pl => `
        <div class="playlist-link ${UI.currentPage === 'playlist' && UI.currentData?.id === pl.id ? 'active' : ''}"
             onclick="UI.navigate('playlist', { id: '${pl.id}' })"
             data-playlist-id="${pl.id}">
          <span class="material-symbols-rounded">queue_music</span>
          ${pl.name}
        </div>
      `).join('');
    }

    container.innerHTML = html;
  }
};
