/* ═══════════════════════════════════════════════
   Radient — Search Module
   ═══════════════════════════════════════════════ */

const Search = {
  debounceTimer: null,
  lastQuery: '',

  init() {
    // Search input is created dynamically by UI
  },

  setupSearchInput() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear');

    if (!input) return;

    input.addEventListener('input', (e) => {
      const query = e.target.value.trim();

      // Show/hide clear button
      if (clearBtn) {
        clearBtn.classList.toggle('visible', query.length > 0);
      }

      // Debounce search
      clearTimeout(this.debounceTimer);
      if (query.length < 2) {
        UI.renderSearchDefault();
        return;
      }

      this.debounceTimer = setTimeout(() => {
        this.performSearch(query);
      }, 350);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.remove('visible');
        UI.renderSearchDefault();
        input.focus();
      });
    }

    // Focus input
    input.focus();
  },

  async performSearch(query) {
    if (query === this.lastQuery) return;
    this.lastQuery = query;

    UI.showSearchLoading();

    try {
      const response = await fetch(`/api/search/songs?query=${encodeURIComponent(query)}&limit=30`);
      const data = await response.json();

      if (query !== this.lastQuery) return; // Stale result

      const songs = data?.data?.results || [];
      UI.renderSearchResults(songs, query);
    } catch (err) {
      console.error('[Search] Error:', err);
      UI.showToast('Search failed. Check your connection.', 'error');
    }
  },

  async searchSongs(query, limit = 20) {
    try {
      const response = await fetch(`/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`);
      const data = await response.json();
      return data?.data?.results || [];
    } catch (err) {
      console.error('[Search] searchSongs error:', err);
      return [];
    }
  },

  async searchAlbums(query, limit = 10) {
    try {
      const response = await fetch(`/api/search/albums?query=${encodeURIComponent(query)}&limit=${limit}`);
      const data = await response.json();
      return data?.data?.results || [];
    } catch (err) {
      console.error('[Search] searchAlbums error:', err);
      return [];
    }
  },

  async getAlbumDetails(id) {
    try {
      const response = await fetch(`/api/albums?id=${id}`);
      const data = await response.json();
      return data?.data || null;
    } catch (err) {
      console.error('[Search] getAlbum error:', err);
      return null;
    }
  },

  async getSongSuggestions(id) {
    try {
      const response = await fetch(`/api/songs/${id}/suggestions`);
      const data = await response.json();
      return data?.data || [];
    } catch (err) {
      console.error('[Search] suggestions error:', err);
      return [];
    }
  },

  async getTrending() {
    // Search for popular/trending terms to populate home page
    const queries = ['top hits 2025', 'latest bollywood', 'trending english songs', 'arijit singh'];
    const results = {};

    for (const q of queries) {
      try {
        const songs = await this.searchSongs(q, 10);
        results[q] = songs;
      } catch {}
    }

    return results;
  }
};
