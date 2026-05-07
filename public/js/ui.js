/* ═══════════════════════════════════════════════
   Radient — UI Controller & Rendering
   ═══════════════════════════════════════════════ */

const UI = {
  currentPage: 'home',
  currentData: null,
  history: [],
  historyIndex: -1,

  init() {
    // Sidebar nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(link.dataset.page);
      });
    });

    // Bottom nav links (mobile)
    document.querySelectorAll('#bottom-nav .bottom-nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(link.dataset.page);
      });
    });

    // Back/Forward
    document.getElementById('btn-back').addEventListener('click', () => this.goBack());
    document.getElementById('btn-forward').addEventListener('click', () => this.goForward());

    // Mobile menu (sidebar)
    document.getElementById('btn-menu').addEventListener('click', () => this.toggleSidebar());
    document.getElementById('sidebar-overlay').addEventListener('click', () => this.toggleSidebar(false));

    // Queue panel
    document.getElementById('btn-queue').addEventListener('click', () => this.toggleQueue());

    // Modal overlay
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-overlay')) this.hideModal();
    });

    // Full-screen player — tap mini player to expand
    document.getElementById('player-bar').addEventListener('click', (e) => {
      if (!e.target.closest('button') && !e.target.closest('input')) {
        this.expandFullPlayer();
      }
    });

    // Full-screen player — close button
    document.getElementById('btn-close-full-player').addEventListener('click', () => this.collapseFullPlayer());

    // Full-screen player — sync controls to Player
    document.getElementById('btn-full-play').addEventListener('click', () => Player.toggle());
    document.getElementById('btn-full-next').addEventListener('click', () => Player.next());
    document.getElementById('btn-full-prev').addEventListener('click', () => Player.prev());
    document.getElementById('btn-full-shuffle').addEventListener('click', () => Player.toggleShuffle());
    document.getElementById('btn-full-repeat').addEventListener('click', () => Player.toggleRepeat());
    document.getElementById('btn-full-like').addEventListener('click', () => Player.toggleLikeCurrent());

    // Full-screen progress bar
    const fullBar = document.getElementById('full-player-progress-bar');
    fullBar.addEventListener('input', (e) => {
      Player.audio.currentTime = (e.target.value / 100) * (Player.audio.duration || 0);
    });

    // Swipe down to close full-screen player
    this.setupFullPlayerSwipe();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); Player.toggle(); }
      if (e.code === 'ArrowRight' && e.shiftKey) Player.next();
      if (e.code === 'ArrowLeft' && e.shiftKey) Player.prev();
      if (e.code === 'Escape') this.collapseFullPlayer();
    });
  },

  // ─── Full-Screen Player ───

  expandFullPlayer() {
    if (!Player.getCurrentTrack()) return;
    document.getElementById('full-player').classList.add('active');
    document.body.style.overflow = 'hidden';
    navigator.vibrate && navigator.vibrate(8);
  },

  collapseFullPlayer() {
    const fp = document.getElementById('full-player');
    fp.classList.remove('active');
    fp.style.transform = '';
    document.body.style.overflow = '';
  },

  setupFullPlayerSwipe() {
    const fp = document.getElementById('full-player');
    let startY = 0;

    fp.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
    }, { passive: true });

    fp.addEventListener('touchmove', (e) => {
      const diff = e.touches[0].clientY - startY;
      if (diff > 0) fp.style.transform = `translateY(${diff}px)`;
    }, { passive: true });

    fp.addEventListener('touchend', (e) => {
      const diff = e.changedTouches[0].clientY - startY;
      if (diff > 90) {
        this.collapseFullPlayer();
      } else {
        fp.style.transform = '';
      }
    });
  },

  // ─── Sync full-player UI with track ───
  updateFullPlayer(track) {
    if (!track) return;
    const art = document.getElementById('full-player-art');
    if (art) {
      art.src = Player.getTrackImage(track, '500x500') || art.src;
      art.alt = track.name || 'Album art';
    }
    const t = document.getElementById('full-player-title');
    const a = document.getElementById('full-player-artist');
    if (t) t.textContent = Player.decodeHTML(track.name || 'Unknown');
    if (a) a.textContent = Player.getArtistNames(track);

    // Sync play button
    const icon = document.getElementById('btn-full-play')?.querySelector('.material-symbols-rounded');
    if (icon) icon.textContent = Player.isPlaying ? 'pause' : 'play_arrow';
  },

  // ─── Navigation ───

  navigate(page, data = null) {
    // Save to history
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push({ page, data });
    this.historyIndex = this.history.length - 1;

    this.currentPage = page;
    this.currentData = data;
    this.renderPage();
    this.updateNavLinks();

    // Close mobile sidebar
    this.toggleSidebar(false);
  },

  goBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const { page, data } = this.history[this.historyIndex];
      this.currentPage = page;
      this.currentData = data;
      this.renderPage();
      this.updateNavLinks();
    }
  },

  goForward() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const { page, data } = this.history[this.historyIndex];
      this.currentPage = page;
      this.currentData = data;
      this.renderPage();
      this.updateNavLinks();
    }
  },

  updateNavLinks() {
    // Sidebar
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === this.currentPage);
    });
    // Bottom nav (mobile)
    document.querySelectorAll('#bottom-nav .bottom-nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === this.currentPage);
    });
    Playlists.refreshSidebar();
  },

  // ─── Page Rendering ───

  renderPage() {
    const content = document.getElementById('page-content');
    content.scrollTop = 0;

    switch (this.currentPage) {
      case 'home':
        this.renderHome();
        break;
      case 'search':
        this.renderSearchPage();
        break;
      case 'library':
        this.renderLibrary();
        break;
      case 'playlist':
        this.renderPlaylistDetail(this.currentData);
        break;
      case 'favorites':
        this.renderFavorites();
        break;
      case 'recent':
        this.renderRecentlyPlayed();
        break;
      default:
        this.renderHome();
    }
  },

  // ─── HOME PAGE ───

  async renderHome() {
    const content = document.getElementById('page-content');
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 18) greeting = 'Good afternoon';

    content.innerHTML = `
      <div class="home-hero fade-in">
        <h2>${greeting}</h2>
        <p>What would you like to listen to?</p>
      </div>
      <div id="recent-chips" class="quick-chips"></div>
      <div id="home-sections">
        ${this.renderSkeletonSection('Trending Now')}
        ${this.renderSkeletonSection('Latest Hits')}
      </div>
    `;

    // Load recently played as quick chips
    this.loadRecentChips();

    // Load trending content
    this.loadHomeContent();
  },

  async loadRecentChips() {
    const recent = await RadientDB.getRecentlyPlayed(6);
    const container = document.getElementById('recent-chips');
    if (!container || recent.length === 0) return;

    container.innerHTML = recent.map(track => `
      <div class="quick-chip" onclick="Player.play(${this.escapeTrackData(track)}, [${this.escapeTrackData(track)}], 0)">
        <img src="${Player.getTrackImage(track, '50x50')}" alt="" 
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22><rect fill=%22%231a1a1a%22 width=%221%22 height=%221%22/></svg>'">
        <span>${Player.decodeHTML(track.name)}</span>
      </div>
    `).join('');
  },

  async loadHomeContent() {
    const sections = document.getElementById('home-sections');
    if (!sections) return;

    const categories = [
      { title: 'Trending Now', query: 'top hits 2025' },
      { title: 'Bollywood Hits', query: 'latest bollywood songs' },
      { title: 'English Pop', query: 'top english pop songs 2025' },
      { title: 'Chill Vibes', query: 'lofi chill vibes' }
    ];

    let html = '';
    for (const category of categories) {
      try {
        const songs = await Search.searchSongs(category.query, 10);
        if (songs.length > 0) {
          html += this.renderSection(category.title, songs);
        }
      } catch {}
    }

    if (html) {
      sections.innerHTML = html;
    }
  },

  renderSection(title, songs) {
    return `
      <div class="section fade-in">
        <div class="section-header">
          <h3>${title}</h3>
        </div>
        <div class="horizontal-scroll">
          ${songs.map(song => this.renderSongCard(song)).join('')}
        </div>
      </div>
    `;
  },

  renderSongCard(song) {
    const image = Player.getTrackImage(song, '500x500');
    const artist = Player.getArtistNames(song);
    const dataAttr = this.escapeAttr(JSON.stringify(Player.normalizeTrack(song)));

    return `
      <div class="card" data-track='${dataAttr}' 
           onclick="UI.playSongCard(this)">
        <div class="card-image">
          <img src="${image}" alt="${Player.decodeHTML(song.name)}" loading="lazy"
               onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22><rect fill=%22%231a1a1a%22 width=%221%22 height=%221%22/></svg>'">
          <button class="card-play-btn" onclick="event.stopPropagation(); UI.playSongCard(this.closest('.card'))">
            <span class="material-symbols-rounded">play_arrow</span>
          </button>
        </div>
        <div class="card-title">${Player.decodeHTML(song.name)}</div>
        <div class="card-subtitle">${artist}</div>
      </div>
    `;
  },

  playSongCard(cardEl) {
    try {
      const track = JSON.parse(cardEl.dataset.track);
      // Collect all cards in the same section for queue
      const container = cardEl.closest('.horizontal-scroll') || cardEl.closest('.card-grid');
      let queue = [track];
      let index = 0;

      if (container) {
        const allCards = container.querySelectorAll('.card[data-track]');
        queue = [];
        allCards.forEach((c, i) => {
          try {
            const t = JSON.parse(c.dataset.track);
            queue.push(t);
            if (c === cardEl) index = i;
          } catch {}
        });
      }

      Player.play(track, queue, index);
    } catch (err) {
      console.error('[UI] playSongCard error:', err);
    }
  },

  // ─── SEARCH PAGE ───

  renderSearchPage() {
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="search-container fade-in">
        <div class="search-box">
          <span class="material-symbols-rounded" style="pointer-events: none;">search</span>
          <input type="text" class="search-input" id="search-input" 
                 placeholder="What do you want to listen to?">
          <button class="btn-icon search-clear" id="search-clear">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <div id="search-results">
          ${this.renderSearchDefaultContent()}
        </div>
      </div>
    `;

    Search.setupSearchInput();
  },

  renderSearchDefaultContent() {
    const genres = [
      { name: 'Bollywood', color: 'linear-gradient(135deg, #e91e63, #9c27b0)' },
      { name: 'Pop', color: 'linear-gradient(135deg, #1db954, #1ed760)' },
      { name: 'Hip-Hop', color: 'linear-gradient(135deg, #f57c00, #ff9800)' },
      { name: 'Rock', color: 'linear-gradient(135deg, #d32f2f, #ff5722)' },
      { name: 'Classical', color: 'linear-gradient(135deg, #5c6bc0, #7c4dff)' },
      { name: 'Punjabi', color: 'linear-gradient(135deg, #00bcd4, #009688)' },
      { name: 'Romantic', color: 'linear-gradient(135deg, #e91e63, #f06292)' },
      { name: 'Party', color: 'linear-gradient(135deg, #ff6f00, #ffc107)' },
      { name: 'Devotional', color: 'linear-gradient(135deg, #ef6c00, #d84315)' },
      { name: 'Lofi', color: 'linear-gradient(135deg, #455a64, #607d8b)' },
      { name: 'EDM', color: 'linear-gradient(135deg, #7c3aed, #06b6d4)' },
      { name: 'Jazz', color: 'linear-gradient(135deg, #795548, #a1887f)' }
    ];

    return `
      <div class="section">
        <div class="section-header">
          <h3>Browse Genres</h3>
        </div>
        <div class="genre-grid">
          ${genres.map(g => `
            <div class="genre-card" style="background: ${g.color}" 
                 onclick="document.getElementById('search-input').value='${g.name} songs'; Search.performSearch('${g.name} songs')">
              <span>${g.name}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  renderSearchDefault() {
    const results = document.getElementById('search-results');
    if (results) {
      results.innerHTML = this.renderSearchDefaultContent();
    }
  },

  showSearchLoading() {
    const results = document.getElementById('search-results');
    if (results) {
      results.innerHTML = `
        <div class="track-list">
          ${Array(8).fill('').map(() => `
            <div class="track-item" style="pointer-events: none;">
              <div class="track-number"><div class="skeleton" style="width: 20px; height: 14px;"></div></div>
              <div class="track-image"><div class="skeleton skeleton-image" style="width: 44px; height: 44px;"></div></div>
              <div class="track-info">
                <div class="skeleton skeleton-text" style="margin-bottom: 6px;"></div>
                <div class="skeleton skeleton-text short"></div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  },

  renderSearchResults(songs, query) {
    const results = document.getElementById('search-results');
    if (!results) return;

    if (songs.length === 0) {
      results.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">search_off</span>
          <h4>No results found</h4>
          <p>Try different keywords or check your spelling</p>
        </div>
      `;
      return;
    }

    results.innerHTML = `
      <div class="section fade-in">
        <div class="section-header">
          <h3>Results for "${query}"</h3>
          <span class="see-all" style="cursor: default;">${songs.length} songs</span>
        </div>
        <div class="track-list">
          ${songs.map((song, i) => this.renderTrackItem(song, i, songs)).join('')}
        </div>
      </div>
    `;
  },

  // ─── LIBRARY PAGE ───

  async renderLibrary() {
    const content = document.getElementById('page-content');
    const playlists = await RadientDB.getPlaylists();
    const favorites = await RadientDB.getFavorites();
    const recent = await RadientDB.getRecentlyPlayed();

    content.innerHTML = `
      <div class="library-header fade-in">
        <h2>Your Library</h2>
      </div>
      <div class="library-grid fade-in">
        <div class="library-card" onclick="UI.navigate('favorites')">
          <div class="library-card-icon liked">
            <span class="material-symbols-rounded">favorite</span>
          </div>
          <h4>Liked Songs</h4>
          <p>${favorites.length} songs</p>
        </div>
        <div class="library-card" onclick="UI.navigate('recent')">
          <div class="library-card-icon recent">
            <span class="material-symbols-rounded">history</span>
          </div>
          <h4>Recently Played</h4>
          <p>${recent.length} songs</p>
        </div>
        ${playlists.map(pl => `
          <div class="library-card" onclick="UI.navigate('playlist', { id: '${pl.id}' })">
            <div class="library-card-icon" style="background: var(--accent-gradient);">
              <span class="material-symbols-rounded">queue_music</span>
            </div>
            <h4>${pl.name}</h4>
            <p>${pl.tracks.length} songs</p>
          </div>
        `).join('')}
      </div>
    `;
  },

  // ─── PLAYLIST DETAIL ───

  async renderPlaylistDetail(data) {
    if (!data?.id) return this.renderLibrary();

    const content = document.getElementById('page-content');
    const playlist = await RadientDB.getPlaylist(data.id);

    if (!playlist) {
      content.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">error</span>
          <h4>Playlist not found</h4>
        </div>
      `;
      return;
    }

    const trackCount = playlist.tracks.length;
    const totalDuration = playlist.tracks.reduce((sum, t) => sum + (parseInt(t.duration) || 0), 0);
    const coverImage = trackCount > 0 ? Player.getTrackImage(playlist.tracks[0], '500x500') : '';

    content.innerHTML = `
      <div class="fade-in">
        <div class="detail-header">
          <div class="detail-cover ${coverImage ? '' : 'playlist-cover'}">
            ${coverImage
              ? `<img src="${coverImage}" alt="${playlist.name}">`
              : '<span class="material-symbols-rounded">queue_music</span>'
            }
          </div>
          <div class="detail-info">
            <span class="detail-type">Playlist</span>
            <h1 class="detail-title">${playlist.name}</h1>
            <div class="detail-meta">
              <span>${trackCount} songs</span>
              <span class="dot"></span>
              <span>${Player.formatTime(totalDuration)}</span>
            </div>
          </div>
        </div>

        <div class="detail-actions">
          ${trackCount > 0 ? `
            <button class="btn-play-large" onclick="UI.playPlaylist('${playlist.id}')">
              <span class="material-symbols-rounded">play_arrow</span>
            </button>
          ` : ''}
          <button class="btn-secondary" onclick="Playlists.showRenameModal('${playlist.id}', '${playlist.name}')">
            Rename
          </button>
          <button class="btn-icon" onclick="Playlists.showDeleteConfirm('${playlist.id}', '${playlist.name}')"
                  title="Delete playlist">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>

        ${trackCount > 0 ? `
          <div class="track-list-header">
            <span>#</span>
            <span></span>
            <span>Title</span>
            <span></span>
            <span style="text-align: right;">
              <span class="material-symbols-rounded" style="font-size: 16px;">schedule</span>
            </span>
          </div>
          <div class="track-list">
            ${playlist.tracks.map((track, i) => 
              this.renderTrackItem(track, i, playlist.tracks, { playlistId: playlist.id, removable: true })
            ).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <span class="material-symbols-rounded">library_music</span>
            <h4>This playlist is empty</h4>
            <p>Search for songs and add them here</p>
          </div>
        `}
      </div>
    `;
  },

  async playPlaylist(playlistId) {
    const playlist = await RadientDB.getPlaylist(playlistId);
    if (!playlist || playlist.tracks.length === 0) return;
    Player.play(playlist.tracks[0], playlist.tracks, 0);
  },

  // ─── FAVORITES ───

  async renderFavorites() {
    const content = document.getElementById('page-content');
    const favorites = await RadientDB.getFavorites();

    content.innerHTML = `
      <div class="fade-in">
        <div class="detail-header">
          <div class="detail-cover playlist-cover" style="background: linear-gradient(135deg, #ec4899, #f43f5e);">
            <span class="material-symbols-rounded">favorite</span>
          </div>
          <div class="detail-info">
            <span class="detail-type">Playlist</span>
            <h1 class="detail-title">Liked Songs</h1>
            <div class="detail-meta">
              <span>${favorites.length} songs</span>
            </div>
          </div>
        </div>

        <div class="detail-actions">
          ${favorites.length > 0 ? `
            <button class="btn-play-large" style="background: #ec4899; box-shadow: 0 8px 24px rgba(236, 72, 153, 0.35);"
                    onclick="UI.playFavorites()">
              <span class="material-symbols-rounded">play_arrow</span>
            </button>
          ` : ''}
        </div>

        ${favorites.length > 0 ? `
          <div class="track-list">
            ${favorites.map((track, i) => this.renderTrackItem(track, i, favorites)).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <span class="material-symbols-rounded">favorite_border</span>
            <h4>No liked songs yet</h4>
            <p>Tap the heart icon on songs you love</p>
          </div>
        `}
      </div>
    `;
  },

  async playFavorites() {
    const favorites = await RadientDB.getFavorites();
    if (favorites.length > 0) {
      Player.play(favorites[0], favorites, 0);
    }
  },

  // ─── RECENTLY PLAYED ───

  async renderRecentlyPlayed() {
    const content = document.getElementById('page-content');
    const recent = await RadientDB.getRecentlyPlayed();

    content.innerHTML = `
      <div class="fade-in">
        <div class="detail-header">
          <div class="detail-cover playlist-cover" style="background: linear-gradient(135deg, #06b6d4, #14b8a6);">
            <span class="material-symbols-rounded">history</span>
          </div>
          <div class="detail-info">
            <span class="detail-type">History</span>
            <h1 class="detail-title">Recently Played</h1>
            <div class="detail-meta">
              <span>${recent.length} songs</span>
            </div>
          </div>
        </div>

        <div class="detail-actions">
          ${recent.length > 0 ? `
            <button class="btn-play-large" style="background: #06b6d4; box-shadow: 0 8px 24px rgba(6, 182, 212, 0.35);"
                    onclick="UI.playRecent()">
              <span class="material-symbols-rounded">play_arrow</span>
            </button>
          ` : ''}
        </div>

        ${recent.length > 0 ? `
          <div class="track-list">
            ${recent.map((track, i) => this.renderTrackItem(track, i, recent)).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <span class="material-symbols-rounded">history</span>
            <h4>Nothing here yet</h4>
            <p>Start listening to build your history</p>
          </div>
        `}
      </div>
    `;
  },

  async playRecent() {
    const recent = await RadientDB.getRecentlyPlayed();
    if (recent.length > 0) {
      Player.play(recent[0], recent, 0);
    }
  },

  // ─── Track Item Renderer ───

  renderTrackItem(track, index, allTracks, options = {}) {
    const image = Player.getTrackImage(track, '150x150');
    const artist = Player.getArtistNames(track);
    const duration = Player.formatTime(parseInt(track.duration) || 0);
    const isPlaying = Player.getCurrentTrack()?.id === track.id;
    const dataAttr = this.escapeAttr(JSON.stringify(Player.normalizeTrack(track)));
    const allTracksAttr = this.escapeAttr(JSON.stringify(allTracks.map(t => Player.normalizeTrack(t))));

    return `
      <div class="track-item ${isPlaying ? 'playing' : ''}" 
           data-track-id="${track.id}"
           data-track='${dataAttr}'
           data-all-tracks='${allTracksAttr}'
           data-index="${index}"
           onclick="UI.playTrackItem(this)">
        <div class="track-number">
          ${isPlaying 
            ? '<div class="equalizer"><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>'
            : `<span class="track-number-text">${index + 1}</span>
               <span class="material-symbols-rounded track-play-icon" style="font-size: 18px; font-variation-settings: 'FILL' 1;">play_arrow</span>`
          }
        </div>
        <div class="track-image">
          <img src="${image}" alt="" loading="lazy"
               onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22><rect fill=%22%231a1a1a%22 width=%221%22 height=%221%22/></svg>'">
        </div>
        <div class="track-info">
          <div class="track-name">${Player.decodeHTML(track.name)}</div>
          <div class="track-artist">${artist}</div>
        </div>
        <div class="track-actions">
          <button class="btn-icon" title="Add to playlist" 
                  onclick="event.stopPropagation(); Playlists.showAddToPlaylistMenu(JSON.parse(this.closest('.track-item').dataset.track), event.clientX, event.clientY)">
            <span class="material-symbols-rounded">playlist_add</span>
          </button>
          ${options.removable ? `
            <button class="btn-icon" title="Remove from playlist"
                    onclick="event.stopPropagation(); UI.removeFromPlaylist('${options.playlistId}', '${track.id}')">
              <span class="material-symbols-rounded">remove_circle_outline</span>
            </button>
          ` : `
            <button class="btn-icon" title="Add to queue"
                    onclick="event.stopPropagation(); Player.addToQueue(JSON.parse(this.closest('.track-item').dataset.track))">
              <span class="material-symbols-rounded">queue</span>
            </button>
          `}
        </div>
        <div class="track-duration">${duration}</div>
      </div>
    `;
  },

  playTrackItem(el) {
    try {
      const track = JSON.parse(el.dataset.track);
      const allTracks = JSON.parse(el.dataset.allTracks);
      const index = parseInt(el.dataset.index);
      Player.play(track, allTracks, index);
    } catch (err) {
      console.error('[UI] playTrackItem error:', err);
    }
  },

  async removeFromPlaylist(playlistId, trackId) {
    await RadientDB.removeTrackFromPlaylist(playlistId, trackId);
    this.showToast('Removed from playlist', 'success');
    this.navigate('playlist', { id: playlistId });
  },

  // ─── Queue Panel ───

  toggleQueue() {
    let panel = document.getElementById('queue-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'queue-panel';
      panel.className = 'queue-panel';
      document.getElementById('app').appendChild(panel);
    }

    panel.classList.toggle('active');

    if (panel.classList.contains('active')) {
      this.renderQueue();
    }
  },

  renderQueue() {
    const panel = document.getElementById('queue-panel');
    if (!panel) return;

    const currentTrack = Player.getCurrentTrack();
    const upNext = Player.queue.slice(Player.currentIndex + 1);

    panel.innerHTML = `
      <div class="queue-panel-header">
        <h3>Queue</h3>
        <button class="btn-icon" onclick="UI.toggleQueue()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="queue-panel-list">
        ${currentTrack ? `
          <div style="padding: 8px 12px 4px; font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 1px;">Now Playing</div>
          ${this.renderTrackItem(currentTrack, 0, [currentTrack])}
        ` : ''}
        ${upNext.length > 0 ? `
          <div style="padding: 16px 12px 4px; font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 1px;">Up Next</div>
          ${upNext.map((t, i) => this.renderTrackItem(t, i, upNext)).join('')}
        ` : `
          <div style="padding: 24px 12px; text-align: center; color: var(--text-tertiary); font-size: 13px;">
            No upcoming songs
          </div>
        `}
      </div>
    `;
  },

  // ─── Sidebar Toggle (mobile) ───

  toggleSidebar(open) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (open === undefined) {
      open = !sidebar.classList.contains('open');
    }

    sidebar.classList.toggle('open', open);
    overlay.classList.toggle('active', open);
  },

  // ─── Modal ───

  showModal(html) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = html;
    overlay.classList.add('active');
  },

  hideModal() {
    document.getElementById('modal-overlay').classList.remove('active');
  },

  // ─── Toast ───

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = {
      success: 'check_circle',
      error: 'error',
      info: 'info',
      warning: 'warning'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="material-symbols-rounded">${icons[type] || 'info'}</span>
      ${message}
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  },

  // ─── Skeleton Loader ───

  renderSkeletonSection(title) {
    return `
      <div class="section">
        <div class="section-header">
          <h3>${title}</h3>
        </div>
        <div class="horizontal-scroll">
          ${Array(6).fill('').map(() => `
            <div class="card" style="pointer-events: none;">
              <div class="card-image">
                <div class="skeleton skeleton-image"></div>
              </div>
              <div class="skeleton skeleton-text" style="margin-bottom: 6px;"></div>
              <div class="skeleton skeleton-text short"></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  // ─── Utility ───

  escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  escapeTrackData(track) {
    return JSON.stringify(Player.normalizeTrack(track));
  }
};
