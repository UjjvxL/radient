-- Radient — SQLite Schema v1
-- Intelligent Spotify Import & Sync Engine

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ═══════════════════════════════════════
-- Users
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT ('usr_' || hex(randomblob(8))),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Insert default user on first run
INSERT OR IGNORE INTO users (id) VALUES ('usr_default');

-- ═══════════════════════════════════════
-- Spotify Account Linkage
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS spotify_accounts (
  id TEXT PRIMARY KEY DEFAULT ('spa_' || hex(randomblob(8))),
  user_id TEXT NOT NULL REFERENCES users(id),
  spotify_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  token_expires_at INTEGER NOT NULL,
  scopes TEXT,
  linked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_sync_at INTEGER
);

-- ═══════════════════════════════════════
-- Canonical Tracks (Radient's own registry)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY DEFAULT ('trk_' || hex(randomblob(8))),
  title TEXT NOT NULL,
  title_normalized TEXT NOT NULL,
  artists TEXT NOT NULL,           -- JSON array
  artists_normalized TEXT NOT NULL,
  album TEXT,
  duration_ms INTEGER,
  isrc TEXT,
  year INTEGER,
  sources TEXT NOT NULL DEFAULT '{}', -- JSON: {jiosaavn_id, youtube_id, ...}
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_tracks_isrc ON tracks(isrc) WHERE isrc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracks_norm ON tracks(title_normalized, artists_normalized);

-- ═══════════════════════════════════════
-- Spotify Track Metadata Cache
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS spotify_tracks (
  spotify_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artists TEXT NOT NULL,            -- JSON array of {name, id}
  album TEXT,
  album_art TEXT,
  duration_ms INTEGER,
  isrc TEXT,
  popularity INTEGER,
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sp_isrc ON spotify_tracks(isrc) WHERE isrc IS NOT NULL;

-- ═══════════════════════════════════════
-- Track Mappings (Spotify → Radient)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS track_mappings (
  id TEXT PRIMARY KEY DEFAULT ('map_' || hex(randomblob(8))),
  spotify_track_id TEXT NOT NULL UNIQUE REFERENCES spotify_tracks(spotify_id),
  radient_track_id TEXT REFERENCES tracks(id),
  match_strategy TEXT NOT NULL DEFAULT 'pending',
  confidence REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  youtube_video_id TEXT,
  jiosaavn_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_map_status ON track_mappings(status);

-- ═══════════════════════════════════════
-- Playlists
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS playlists_v2 (
  id TEXT PRIMARY KEY DEFAULT ('pl_' || hex(randomblob(8))),
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  spotify_playlist_id TEXT,
  spotify_snapshot_id TEXT,
  sync_enabled INTEGER NOT NULL DEFAULT 0,
  track_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pl_spotify ON playlists_v2(spotify_playlist_id)
  WHERE spotify_playlist_id IS NOT NULL;

-- ═══════════════════════════════════════
-- Playlist Tracks (ordered junction)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS playlist_tracks_v2 (
  playlist_id TEXT NOT NULL REFERENCES playlists_v2(id) ON DELETE CASCADE,
  track_mapping_id TEXT NOT NULL REFERENCES track_mappings(id),
  position INTEGER NOT NULL,
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (playlist_id, track_mapping_id)
);

-- ═══════════════════════════════════════
-- Import Jobs
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY DEFAULT ('imp_' || hex(randomblob(8))),
  user_id TEXT NOT NULL REFERENCES users(id),
  spotify_playlist_id TEXT NOT NULL,
  playlist_id TEXT REFERENCES playlists_v2(id),
  status TEXT NOT NULL DEFAULT 'queued',
  total_tracks INTEGER NOT NULL DEFAULT 0,
  matched_tracks INTEGER NOT NULL DEFAULT 0,
  failed_tracks INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ═══════════════════════════════════════
-- Sync State
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS sync_state (
  playlist_id TEXT PRIMARY KEY REFERENCES playlists_v2(id) ON DELETE CASCADE,
  last_snapshot_id TEXT,
  last_sync_at INTEGER,
  next_sync_at INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'idle',
  error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);

-- ═══════════════════════════════════════
-- Imported Playlist Tracks (direct import, no Redis needed)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS imported_playlist_tracks (
  playlist_id TEXT NOT NULL REFERENCES playlists_v2(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  jiosaavn_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artists TEXT NOT NULL,          -- JSON array
  album TEXT,
  album_art TEXT,
  duration INTEGER DEFAULT 0,    -- seconds
  download_url TEXT,
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (playlist_id, jiosaavn_id)
);
