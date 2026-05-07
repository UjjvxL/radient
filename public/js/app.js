/* ═══════════════════════════════════════════════
   Radient — Main Application Entry Point
   ═══════════════════════════════════════════════ */

const App = {
  async init() {
    console.log('%c🎵 Radient — Music Without Limits', 'font-size: 18px; color: #a855f7; font-weight: bold;');

    try {
      await RadientDB.init();
      Player.init();
      UI.init();
      Playlists.init();
      Search.init();
      SpotifyImport.init();
      await Playlists.refreshSidebar();
      UI.navigate('home');
      this.registerServiceWorker();
      this.setupNetworkDetection();
      this.setupInstallPrompt();

      // Welcome toast on first visit
      if (!localStorage.getItem('radient_visited')) {
        setTimeout(() => UI.showToast('Welcome to Radient 🎵', 'success'), 1000);
        localStorage.setItem('radient_visited', 'true');
      }

      console.log('[App] Ready');
    } catch (err) {
      console.error('[App] Init error:', err);
    }
  },

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        console.log('[SW] Registered:', reg.scope);
      } catch (err) {
        console.error('[SW] Registration failed:', err);
      }
    }
  },

  setupNetworkDetection() {
    window.addEventListener('online', () => UI.showToast('Back online!', 'success'));
    window.addEventListener('offline', () => UI.showToast('You are offline', 'warning'));
  },

  setupInstallPrompt() {
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;

      // Show a subtle install button in the top bar after 3s
      setTimeout(() => {
        const btn = document.createElement('button');
        btn.id = 'btn-install';
        btn.className = 'btn-icon';
        btn.title = 'Install Radient App';
        btn.innerHTML = '<span class="material-symbols-rounded">install_mobile</span>';
        btn.style.cssText = 'color: var(--accent-light);';
        btn.onclick = async () => {
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') UI.showToast('Radient installed! 🎉', 'success');
          btn.remove();
          deferredPrompt = null;
        };
        document.getElementById('top-bar')?.appendChild(btn);
      }, 3000);
    });

    window.addEventListener('appinstalled', () => {
      UI.showToast('Radient installed! 🎉', 'success');
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
