import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'radient.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Performance settings
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Run schema on first boot
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');
db.exec(schema);

// --- Migrations ---
try {
  const cols = db.pragma('table_info(imported_playlist_tracks)') as any[];
  if (!cols.some(c => c.name === 'youtube_video_id')) {
    db.exec('ALTER TABLE imported_playlist_tracks ADD COLUMN youtube_video_id TEXT;');
    console.log('[DB] Migrated: added youtube_video_id to imported_playlist_tracks');
  }
} catch (e) {
  console.error('[DB] Migration failed:', e);
}

console.log('[DB] SQLite initialized at', DB_PATH);

export default db;
