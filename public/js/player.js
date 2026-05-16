/* ═══════════════════════════════════════════════
   Radient — Audio Player Engine
   ═══════════════════════════════════════════════ */

const Player = {
  audio: null,
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  shuffleMode: false,
  repeatMode: 'none', // none, all, one
  shuffleOrder: [],
  volume: 80,
  wakeLock: null,

  init() {
    this.audio = document.getElementById('audio-player');
    this.setupEventListeners();
    this.setupMediaSession();
    this.initWakeLock();

    // Restore volume
    const savedVol = localStorage.getItem('radient_volume');
    if (savedVol !== null) {
      this.volume = parseInt(savedVol);
      this.audio.volume = this.volume / 100;
      document.getElementById('player-volume').value = this.volume;
    }

    // Handle app going to background — keep playing
    document.addEventListener('visibilitychange', () => this.onVisibilityChange());

    this.updateProgressUI();
  },

  // ─── Wake Lock (keeps audio alive when screen is off) ───

  async initWakeLock() {
    if (!('wakeLock' in navigator)) return;
    // Acquire on first user interaction (required by browsers)
    document.addEventListener('click', async () => {
      if (this.isPlaying && !this.wakeLock) {
        await this.acquireWakeLock();
      }
    }, { once: true });
  },

  async acquireWakeLock() {
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
      console.log('[Player] Wake Lock acquired');
    } catch (err) {
      console.log('[Player] Wake Lock failed:', err.message);
    }
  },

  async releaseWakeLock() {
    if (this.wakeLock) {
      await this.wakeLock.release();
      this.wakeLock = null;
    }
  },

  onVisibilityChange() {
    if (document.hidden) {
      // App backgrounded — audio should keep playing via Media Session
      // Re-acquire wake lock will happen when visible again if needed
      if (this.isPlaying && this.audio.paused) {
        this.audio.play().catch(e => console.log('[Player] Background resume failed:', e));
      }
    } else {
      // App foregrounded — re-acquire wake lock if playing
      if (this.isPlaying && !this.wakeLock) {
        this.acquireWakeLock();
      }
    }
  },

  setupEventListeners() {
    const audio = this.audio;

    audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    audio.addEventListener('ended', () => this.onTrackEnded());
    audio.addEventListener('loadedmetadata', () => this.onMetadataLoaded());
    audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.updatePlayButton();
    });
    audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updatePlayButton();
    });
    audio.addEventListener('error', (e) => {
      console.error('[Player] Audio error:', e);
      UI.showToast('Failed to play track', 'error');
      // Try next track
      setTimeout(() => this.next(), 1000);
    });

    // Controls
    document.getElementById('btn-play').addEventListener('click', () => this.toggle());
    document.getElementById('btn-next').addEventListener('click', () => this.next());
    document.getElementById('btn-prev').addEventListener('click', () => this.prev());
    document.getElementById('btn-shuffle').addEventListener('click', () => this.toggleShuffle());
    document.getElementById('btn-repeat').addEventListener('click', () => this.toggleRepeat());

    // Progress bar
    const progressBar = document.getElementById('player-progress-bar');
    progressBar.addEventListener('input', (e) => {
      const time = (e.target.value / 100) * (this.audio.duration || 0);
      this.audio.currentTime = time;
    });

    // Volume
    const volumeSlider = document.getElementById('player-volume');
    volumeSlider.addEventListener('input', (e) => {
      this.setVolume(parseInt(e.target.value));
    });

    document.getElementById('btn-volume').addEventListener('click', () => {
      if (this.volume > 0) {
        this._prevVolume = this.volume;
        this.setVolume(0);
        volumeSlider.value = 0;
      } else {
        this.setVolume(this._prevVolume || 80);
        volumeSlider.value = this._prevVolume || 80;
      }
    });

    // Like button
    document.getElementById('btn-like').addEventListener('click', () => this.toggleLikeCurrent());
  },

  // ─── Core Playback ───

  async play(track, queue = null, index = 0) {
    if (queue) {
      this.queue = [...queue];
      this.currentIndex = index;
      this.generateShuffleOrder();
    }

    if (!track && this.queue.length > 0) {
      track = this.queue[this.currentIndex];
    }

    if (!track) return;

    // Get the best quality download URL
    const url = this.getBestStreamUrl(track);
    if (!url) {
      UI.showToast('No streaming URL available', 'error');
      return;
    }

    this.audio.src = url;
    this.audio.load();

    try {
      await this.audio.play();
      this.isPlaying = true;
      // Acquire wake lock to keep audio alive with screen off
      this.acquireWakeLock();
    } catch (err) {
      console.error('[Player] Play failed:', err);
    }

    this.updateNowPlaying(track);
    this.updateMediaSession(track);
    this.updatePlayButton();

    // Save to recently played
    RadientDB.addToRecentlyPlayed(this.normalizeTrack(track));

    // Check if liked
    this.updateLikeButton(track);
  },

  getBestStreamUrl(track) {
    if (!track) return null;

    // Check if we have a YouTube Video ID attached
    if (track.youtube_video_id) {
      return `/api/stream/youtube/${track.youtube_video_id}`;
    }

    // downloadUrl is usually an array of { quality, url }
    const urls = track.downloadUrl || track.download_url || [];

    if (Array.isArray(urls) && urls.length > 0) {
      // Find highest quality
      const preferred = ['320kbps', '160kbps', '96kbps', '48kbps', '12kbps'];
      for (const q of preferred) {
        const match = urls.find(u => u.quality === q);
        if (match) return match.url;
      }
      // Fallback to last (usually highest)
      return urls[urls.length - 1]?.url || urls[urls.length - 1];
    }

    // Maybe it's a direct URL string
    if (typeof urls === 'string') return urls;

    return null;
  },

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.releaseWakeLock();
    this.updatePlayButton();
  },

  toggle() {
    if (this.isPlaying) {
      this.pause();
    } else if (this.audio.src) {
      this.audio.play();
    } else if (this.queue.length > 0) {
      this.play(this.queue[0], this.queue, 0);
    }
  },

  next() {
    if (this.queue.length === 0) return;

    if (this.shuffleMode) {
      const currentShuffleIdx = this.shuffleOrder.indexOf(this.currentIndex);
      const nextShuffleIdx = (currentShuffleIdx + 1) % this.shuffleOrder.length;
      this.currentIndex = this.shuffleOrder[nextShuffleIdx];
    } else {
      if (this.currentIndex < this.queue.length - 1) {
        this.currentIndex++;
      } else if (this.repeatMode === 'all') {
        this.currentIndex = 0;
      } else {
        return; // End of queue
      }
    }

    this.play(this.queue[this.currentIndex]);
  },

  prev() {
    if (this.queue.length === 0) return;

    // If more than 3 seconds in, restart current track
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }

    if (this.shuffleMode) {
      const currentShuffleIdx = this.shuffleOrder.indexOf(this.currentIndex);
      const prevShuffleIdx = currentShuffleIdx > 0 ? currentShuffleIdx - 1 : this.shuffleOrder.length - 1;
      this.currentIndex = this.shuffleOrder[prevShuffleIdx];
    } else {
      if (this.currentIndex > 0) {
        this.currentIndex--;
      } else if (this.repeatMode === 'all') {
        this.currentIndex = this.queue.length - 1;
      }
    }

    this.play(this.queue[this.currentIndex]);
  },

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(100, vol));
    this.audio.volume = this.volume / 100;
    localStorage.setItem('radient_volume', this.volume.toString());
    this.updateVolumeIcon();
  },

  // ─── Queue Management ───

  setQueue(tracks, startIndex = 0) {
    this.queue = [...tracks];
    this.currentIndex = startIndex;
    this.generateShuffleOrder();
  },

  addToQueue(track) {
    this.queue.push(track);
    UI.showToast('Added to queue', 'success');
  },

  getCurrentTrack() {
    if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      return this.queue[this.currentIndex];
    }
    return null;
  },

  // ─── Shuffle & Repeat ───

  toggleShuffle() {
    this.shuffleMode = !this.shuffleMode;
    document.getElementById('btn-shuffle').classList.toggle('active', this.shuffleMode);
    if (this.shuffleMode) {
      this.generateShuffleOrder();
      UI.showToast('Shuffle on', 'info');
    } else {
      UI.showToast('Shuffle off', 'info');
    }
  },

  generateShuffleOrder() {
    this.shuffleOrder = Array.from({ length: this.queue.length }, (_, i) => i);
    // Fisher-Yates shuffle, keeping current index first
    for (let i = this.shuffleOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffleOrder[i], this.shuffleOrder[j]] = [this.shuffleOrder[j], this.shuffleOrder[i]];
    }
    // Move current index to front
    const currentPos = this.shuffleOrder.indexOf(this.currentIndex);
    if (currentPos > 0) {
      [this.shuffleOrder[0], this.shuffleOrder[currentPos]] = [this.shuffleOrder[currentPos], this.shuffleOrder[0]];
    }
  },

  toggleRepeat() {
    const modes = ['none', 'all', 'one'];
    const currentIdx = modes.indexOf(this.repeatMode);
    this.repeatMode = modes[(currentIdx + 1) % modes.length];

    const btn = document.getElementById('btn-repeat');
    btn.classList.toggle('active', this.repeatMode !== 'none');

    const icon = btn.querySelector('.material-symbols-rounded');
    icon.textContent = this.repeatMode === 'one' ? 'repeat_one' : 'repeat';

    UI.showToast(`Repeat: ${this.repeatMode}`, 'info');
  },

  // ─── Event Handlers ───

  onTimeUpdate() {
    if (!this.audio.duration) return;

    const progress = (this.audio.currentTime / this.audio.duration) * 100;
    const progressBar = document.getElementById('player-progress-bar');
    progressBar.value = progress;
    progressBar.style.setProperty('--value', `${progress}%`);

    document.getElementById('player-current-time').textContent =
      this.formatTime(this.audio.currentTime);

    // Sync full-screen player progress
    const fpBar = document.getElementById('full-player-progress-bar');
    if (fpBar) {
      fpBar.value = progress;
      fpBar.style.setProperty('--value', `${progress}%`);
    }
    const fpTime = document.getElementById('full-player-current-time');
    if (fpTime) fpTime.textContent = this.formatTime(this.audio.currentTime);
  },

  onMetadataLoaded() {
    const dur = this.formatTime(this.audio.duration);
    document.getElementById('player-duration').textContent = dur;
    const fpDur = document.getElementById('full-player-duration');
    if (fpDur) fpDur.textContent = dur;
  },

  onTrackEnded() {
    if (this.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.audio.play();
    } else {
      this.next();
    }
  },

  // ─── UI Updates ───

  updateNowPlaying(track) {
    const art = document.getElementById('player-art');
    const title = document.getElementById('player-title');
    const artist = document.getElementById('player-artist');

    const imageUrl = this.getTrackImage(track, '150x150');
    art.src = imageUrl || '';
    art.alt = track.name || 'Album art';
    art.classList.toggle('playing', true);

    title.textContent = this.decodeHTML(track.name || 'Unknown');
    artist.textContent = this.getArtistNames(track);

    document.title = `${track.name} — Radient`;

    document.querySelectorAll('.track-item').forEach(el => {
      el.classList.toggle('playing', el.dataset.trackId === track.id);
    });

    // Sync full-screen player
    UI.updateFullPlayer(track);
  },

  updatePlayButton() {
    const icon = document.getElementById('btn-play').querySelector('.material-symbols-rounded');
    icon.textContent = this.isPlaying ? 'pause' : 'play_arrow';
    // Also sync full-screen player
    const fpIcon = document.getElementById('btn-full-play')?.querySelector('.material-symbols-rounded');
    if (fpIcon) fpIcon.textContent = this.isPlaying ? 'pause' : 'play_arrow';
  },

  updateVolumeIcon() {
    const icon = document.getElementById('btn-volume').querySelector('.material-symbols-rounded');
    if (this.volume === 0) icon.textContent = 'volume_off';
    else if (this.volume < 50) icon.textContent = 'volume_down';
    else icon.textContent = 'volume_up';
  },

  async updateLikeButton(track) {
    if (!track) return;
    const liked = await RadientDB.isFavorite(track.id);
    const btn = document.getElementById('btn-like');
    btn.classList.toggle('liked', liked);
  },

  async toggleLikeCurrent() {
    const track = this.getCurrentTrack();
    if (!track) return;
    const nowLiked = await RadientDB.toggleFavorite(this.normalizeTrack(track));
    document.getElementById('btn-like').classList.toggle('liked', nowLiked);
    UI.showToast(nowLiked ? 'Added to Liked Songs' : 'Removed from Liked Songs', 'success');
  },

  updateProgressUI() {
    // Continuously update progress bar styling
    const update = () => {
      const progressBar = document.getElementById('player-progress-bar');
      if (progressBar) {
        const val = progressBar.value;
        progressBar.style.setProperty('--value', `${val}%`);
        progressBar.classList.add('styled');
      }
      const volumeBar = document.getElementById('player-volume');
      if (volumeBar) {
        const val = volumeBar.value;
        volumeBar.style.setProperty('--value', `${val}%`);
        volumeBar.classList.add('styled');
      }
      requestAnimationFrame(update);
    };
    update();
  },

  // ─── Media Session API (Lock Screen Controls) ───

  setupMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.toggle());
    navigator.mediaSession.setActionHandler('pause', () => this.toggle());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        this.audio.currentTime = details.seekTime;
      }
    });
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      this.audio.currentTime = Math.max(0, this.audio.currentTime - (details.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + (details.seekOffset || 10));
    });
  },

  updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;

    const artwork = [];
    const images = track.image || [];
    if (Array.isArray(images)) {
      images.forEach(img => {
        const url = img.url || img;
        if (url) {
          artwork.push({
            src: url,
            sizes: img.quality ? img.quality : '512x512',
            type: 'image/jpeg'
          });
        }
      });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: this.decodeHTML(track.name || 'Unknown'),
      artist: this.getArtistNames(track),
      album: track.album?.name || '',
      artwork: artwork.length > 0 ? artwork : [{ src: '/icon-512.png', sizes: '512x512' }]
    });
  },

  // ─── Utility ───

  normalizeTrack(track) {
    return {
      id: track.id,
      name: track.name,
      type: track.type || 'song',
      year: track.year,
      duration: track.duration,
      language: track.language,
      artists: track.artists,
      album: track.album,
      image: track.image,
      downloadUrl: track.downloadUrl || track.download_url
    };
  },

  getTrackImage(track, quality = '150x150') {
    const images = track.image || [];
    if (Array.isArray(images)) {
      const match = images.find(i => i.quality === quality);
      if (match) return match.url;
      return images[images.length - 1]?.url || images[images.length - 1] || '';
    }
    return typeof images === 'string' ? images : '';
  },

  getArtistNames(track) {
    if (track.artists) {
      const primary = track.artists.primary || track.artists.all || [];
      if (Array.isArray(primary) && primary.length > 0) {
        return primary.map(a => a.name).join(', ');
      }
    }
    if (track.primaryArtists) return track.primaryArtists;
    if (track.artist) return track.artist;
    return 'Unknown Artist';
  },

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  decodeHTML(html) {
    if (!html) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
  }
};
