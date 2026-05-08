# Radient — Music Without Limits

Self-hosted, ad-free music streaming PWA. Import playlists from Spotify or paste a text list, match tracks against the JioSaavn catalog (320 kbps), and stream them in-browser.

## Features

- **Spotify OAuth + playlist import** — direct, in-process (no Redis required)
- **Screenshot / text-list import** — paste "Song – Artist" lines to create an Imported Playlist
- **Matching engine** — scores title/artist similarity, lowers threshold for English songs, returns 320 kbps URLs
- **Full-screen player** — queue, repeat, shuffle, like, and mobile swipe-down close
- **SQLite DB** (default) — stores playlists, tracks, encrypted Spotify tokens
- **Responsive UI** — dark-mode, glass-morphism style

## Quick Start (local)

```bash
# 1. Clone
git clone https://github.com/UjjvxL/radient.git
cd radient

# 2. Copy env and fill in values
cp .env.example .env
# Edit .env — at minimum set SPOTIFY_CLIENT_ID and TOKEN_ENCRYPTION_KEY

# 3. Install dependencies (also installs jiosaavn-api-local via postinstall)
npm install

# 4. Start the app (launches Express on :3000 and JioSaavn API on :3001)
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Yes | Spotify app client ID ([developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)) |
| `SPOTIFY_REDIRECT_URI` | Yes | OAuth callback URL. Local: `http://localhost:3000/auth/spotify/callback` |
| `TOKEN_ENCRYPTION_KEY` | Yes | 64-char hex string (32 bytes). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PORT` | No | Server port (default `3000`; auto-injected on Railway) |
| `NODE_ENV` | No | Set `production` to toggle debug logs |
| `YOUTUBE_API_KEY` | No | YouTube Data API v3 key (future fallback for unmatched tracks) |

## Railway Deployment

1. Connect this repo in your Railway project.
2. Set **Build command** to `npm ci` (or `npm ci && npm run build` if a build step is added later).
3. Set **Start command** to `npm start`.
4. Add the environment variables listed above in the Railway dashboard.
5. Set `SPOTIFY_REDIRECT_URI` to `https://<your-app>.up.railway.app/auth/spotify/callback`.
6. Deploy.

A `Dockerfile` is also provided if you prefer container-based deploys:

```bash
docker build -t radient .
docker run -p 3000:3000 --env-file .env radient
```

## Project Structure

```
src/
  bootstrap.ts          — App entry: loads config, DB, mounts routers, starts Express + JioSaavn subprocess
  config.ts             — Reads env vars, builds Spotify URLs, provides TOKEN_ENCRYPTION_KEY
  db/                   — SQLite init (schema.sql) and DB wrapper
  import/controller.ts  — Core import controller: Spotify + screenshot imports, matching, job polling
  auth/spotify-oauth.ts — Spotify OAuth PKCE flow, token refresh
  matching/             — Matching engine (ISRC → exact → fuzzy JioSaavn search → YouTube fallback)
  sync/                 — Playlist sync controller (enable/disable/status)
public/
  index.html            — Main SPA shell
  js/ui.js              — Navigation, modals, toasts
  js/player.js          — Audio player, queue handling
  js/playlists.js       — Sidebar rendering (local + imported playlists)
  js/spotify-import.js  — Import modal UI (Spotify tab + Screenshot tab) and polling logic
  css/styles.css        — All styling (custom CSS variables, glass-morphism)
jiosaavn-api-local/     — Bundled JioSaavn API (Hono server on port 3001)
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/auth/spotify/login` | Start Spotify OAuth PKCE flow |
| GET | `/auth/spotify/callback` | OAuth callback |
| GET | `/auth/spotify/status` | Check if Spotify is connected |
| GET | `/api/spotify/playlists` | List user's Spotify playlists |
| POST | `/api/spotify/import` | Import selected Spotify playlists |
| POST | `/api/import/screenshot` | Import from text list |
| GET | `/api/spotify/import/:jobId` | Poll import job status |
| GET | `/api/imported-playlists` | List imported playlists |
| GET | `/api/imported-playlists/:id/tracks` | Get tracks for an imported playlist |
| GET | `/api/search/songs?query=` | Search JioSaavn songs |
| GET | `/api/songs/:id` | Get song details |

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES2023), HTML5, CSS (glass-morphism), Material Symbols Rounded icons
- **Backend**: Node.js 20, Express, tsx (runtime TypeScript), Better-SQLite3, crypto (AES-256-GCM)
- **Database**: SQLite (`data/radient.db`)
- **External APIs**: JioSaavn (internal proxy), Spotify (OAuth + playlist endpoints)

## License

MIT
