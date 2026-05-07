/* ═══════════════════════════════════════════════
   Radient — IndexedDB Storage Layer
   ═══════════════════════════════════════════════ */

const RadientDB = {
  db: null,
  DB_NAME: 'RadientDB',
  DB_VERSION: 1,

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Playlists store
        if (!db.objectStoreNames.contains('playlists')) {
          const store = db.createObjectStore('playlists', { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Favorites store
        if (!db.objectStoreNames.contains('favorites')) {
          db.createObjectStore('favorites', { keyPath: 'id' });
        }

        // Recently played store
        if (!db.objectStoreNames.contains('recentlyPlayed')) {
          const store = db.createObjectStore('recentlyPlayed', { keyPath: 'id' });
          store.createIndex('playedAt', 'playedAt', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        console.log('[RadientDB] Initialized');
        resolve();
      };

      request.onerror = (e) => {
        console.error('[RadientDB] Error:', e.target.error);
        reject(e.target.error);
      };
    });
  },

  // ─── Generic helpers ───
  _tx(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  },

  _request(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  // ═══════════ PLAYLISTS ═══════════

  async createPlaylist(name, tracks = []) {
    const playlist = {
      id: 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name: name,
      tracks: tracks,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const store = this._tx('playlists', 'readwrite');
    await this._request(store.put(playlist));
    return playlist;
  },

  async getPlaylists() {
    const store = this._tx('playlists');
    const playlists = await this._request(store.getAll());
    return playlists.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getPlaylist(id) {
    const store = this._tx('playlists');
    return this._request(store.get(id));
  },

  async updatePlaylist(id, updates) {
    const store = this._tx('playlists', 'readwrite');
    const playlist = await this._request(store.get(id));
    if (!playlist) throw new Error('Playlist not found');
    Object.assign(playlist, updates, { updatedAt: Date.now() });
    await this._request(store.put(playlist));
    return playlist;
  },

  async deletePlaylist(id) {
    const store = this._tx('playlists', 'readwrite');
    return this._request(store.delete(id));
  },

  async addTrackToPlaylist(playlistId, track) {
    const playlist = await this.getPlaylist(playlistId);
    if (!playlist) throw new Error('Playlist not found');
    // Avoid duplicates
    if (playlist.tracks.some(t => t.id === track.id)) return playlist;
    playlist.tracks.push(track);
    return this.updatePlaylist(playlistId, { tracks: playlist.tracks });
  },

  async removeTrackFromPlaylist(playlistId, trackId) {
    const playlist = await this.getPlaylist(playlistId);
    if (!playlist) throw new Error('Playlist not found');
    playlist.tracks = playlist.tracks.filter(t => t.id !== trackId);
    return this.updatePlaylist(playlistId, { tracks: playlist.tracks });
  },

  // ═══════════ FAVORITES ═══════════

  async toggleFavorite(track) {
    const store = this._tx('favorites', 'readwrite');
    const existing = await this._request(store.get(track.id));
    if (existing) {
      await this._request(store.delete(track.id));
      return false; // unfavorited
    } else {
      await this._request(store.put({ ...track, favoritedAt: Date.now() }));
      return true; // favorited
    }
  },

  async isFavorite(trackId) {
    const store = this._tx('favorites');
    const track = await this._request(store.get(trackId));
    return !!track;
  },

  async getFavorites() {
    const store = this._tx('favorites');
    const favs = await this._request(store.getAll());
    return favs.sort((a, b) => b.favoritedAt - a.favoritedAt);
  },

  // ═══════════ RECENTLY PLAYED ═══════════

  async addToRecentlyPlayed(track) {
    const store = this._tx('recentlyPlayed', 'readwrite');
    // Remove if already exists (to bump it to top)
    try { await this._request(store.delete(track.id)); } catch {}
    await this._request(store.put({ ...track, playedAt: Date.now() }));

    // Keep only last 50
    const all = await this._request(store.getAll());
    if (all.length > 50) {
      const sorted = all.sort((a, b) => a.playedAt - b.playedAt);
      const toRemove = sorted.slice(0, all.length - 50);
      const delStore = this._tx('recentlyPlayed', 'readwrite');
      for (const item of toRemove) {
        delStore.delete(item.id);
      }
    }
  },

  async getRecentlyPlayed(limit = 20) {
    const store = this._tx('recentlyPlayed');
    const all = await this._request(store.getAll());
    return all.sort((a, b) => b.playedAt - a.playedAt).slice(0, limit);
  }
};
