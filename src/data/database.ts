import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('sonance.db');

export interface DBTrack {
  id: string; // Will use UUID or file hash
  title: string;
  artist: string;
  album: string;
  duration: number;
  file_path: string;
  artwork_path: string | null;
  added_at: number;
}

export interface DBPlaylist {
  id: string;
  name: string;
  created_at: number;
}

export function initDatabase() {
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        duration REAL NOT NULL,
        file_path TEXT NOT NULL,
        artwork_path TEXT,
        added_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE,
        FOREIGN KEY (track_id) REFERENCES tracks (id) ON DELETE CASCADE,
        PRIMARY KEY (playlist_id, track_id)
      );

      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id TEXT NOT NULL,
        played_at INTEGER NOT NULL,
        FOREIGN KEY (track_id) REFERENCES tracks (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS equalizer_settings (
        id TEXT PRIMARY KEY NOT NULL,
        enabled INTEGER NOT NULL,
        preset_name TEXT NOT NULL,
        preamp REAL NOT NULL,
        bands_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
      CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
      CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
      CREATE INDEX IF NOT EXISTS idx_history_track ON history(track_id);
    `);

    // Auto-heal any imported tracks that were saved as 'Unknown'
    fixUnknownTracks();
  } catch (e) {
    console.error("Database initialization error:", e);
  }
}

export function fixUnknownTracks() {
  try {
    const tracks = db.getAllSync<DBTrack>('SELECT * FROM tracks WHERE title = "Unknown" OR title = "Unknown Title"');
    for (const track of tracks) {
      const filename = track.file_path.split('/').pop()?.split('\\').pop() || '';
      const cleanName = filename.replace(/\.[^/.]+$/, "");
      let title = cleanName;
      let artist = track.artist;
      if (cleanName.includes(' - ')) {
        const parts = cleanName.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }
      db.runSync(
        'UPDATE tracks SET title = ?, artist = ? WHERE id = ?',
        [title || 'Audio Track', artist === 'Unknown' ? 'Unknown Artist' : artist, track.id]
      );
    }
  } catch (e) {
    console.warn("Could not fix unknown tracks:", e);
  }
}

export function clearAllTracks() {
  try {
    db.execSync('DELETE FROM tracks; DELETE FROM history; DELETE FROM playlist_tracks;');
  } catch (e) {
    console.warn("Failed to clear tracks:", e);
  }
}

export function deleteTrack(trackId: string) {
  try {
    db.runSync('DELETE FROM tracks WHERE id = ?', [trackId]);
  } catch (e) {
    console.warn("Failed to delete track:", e);
  }
}

export function insertTrack(track: DBTrack) {
  try {
    const statement = db.prepareSync(
      'INSERT OR REPLACE INTO tracks (id, title, artist, album, duration, file_path, artwork_path, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    statement.executeSync([
      track.id,
      track.title,
      track.artist,
      track.album,
      track.duration,
      track.file_path,
      track.artwork_path,
      track.added_at
    ]);
  } catch (e) {
    console.warn("Failed to insert track:", e);
  }
}

export function updateTrackDuration(trackId: string, duration: number) {
  if (!trackId || duration <= 0 || isNaN(duration)) return;
  try {
    db.runSync('UPDATE tracks SET duration = ? WHERE id = ?', [duration, trackId]);
  } catch (e) {
    console.warn("Failed to update track duration in SQLite:", e);
  }
}

export function getAllTracks(): DBTrack[] {
  try {
    return db.getAllSync<DBTrack>('SELECT * FROM tracks ORDER BY title ASC');
  } catch (e) {
    console.warn("Failed to get all tracks:", e);
    return [];
  }
}

export function getRecentlyAddedTracks(limit: number = 20): DBTrack[] {
  try {
    return db.getAllSync<DBTrack>('SELECT * FROM tracks ORDER BY added_at DESC LIMIT ?', [limit]);
  } catch (e) {
    console.warn("Failed to get recently added tracks:", e);
    return [];
  }
}

export function searchTracks(query: string): DBTrack[] {
  try {
    const searchTerm = `%${query}%`;
    return db.getAllSync<DBTrack>(
      'SELECT * FROM tracks WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? ORDER BY title ASC',
      [searchTerm, searchTerm, searchTerm]
    );
  } catch (e) {
    console.warn("Failed to search tracks:", e);
    return [];
  }
}

export function getAllPlaylists(): DBPlaylist[] {
  try {
    return db.getAllSync<DBPlaylist>('SELECT * FROM playlists ORDER BY created_at DESC');
  } catch (e) {
    console.warn("Failed to get all playlists:", e);
    return [];
  }
}

export function createPlaylist(id: string, name: string) {
  try {
    const statement = db.prepareSync('INSERT INTO playlists (id, name, created_at) VALUES (?, ?, ?)');
    statement.executeSync([id, name, Date.now()]);
  } catch (e) {
    console.warn("Failed to create playlist:", e);
  }
}

export function getPlaylistTracks(playlistId: string): DBTrack[] {
  try {
    return db.getAllSync<DBTrack>(`
      SELECT t.* FROM tracks t
      INNER JOIN playlist_tracks pt ON t.id = pt.track_id
      WHERE pt.playlist_id = ?
      ORDER BY pt.order_index ASC
    `, [playlistId]);
  } catch (e) {
    console.warn("Failed to get playlist tracks:", e);
    return [];
  }
}

export function addTrackToPlaylist(playlistId: string, trackId: string) {
  try {
    const countObj = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?', [playlistId]);
    const orderIndex = countObj ? countObj.count : 0;
    
    const statement = db.prepareSync('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, order_index) VALUES (?, ?, ?)');
    statement.executeSync([playlistId, trackId, orderIndex]);
  } catch (e) {
    console.warn("Failed to add track to playlist:", e);
  }
}

export function logPlayback(trackId: string) {
  try {
    const statement = db.prepareSync('INSERT INTO history (track_id, played_at) VALUES (?, ?)');
    statement.executeSync([trackId, Date.now()]);
  } catch (e) {
    console.warn("Failed to log playback:", e);
  }
}

export function getRecentlyPlayed(limit: number = 20): DBTrack[] {
  try {
    return db.getAllSync<DBTrack>(`
      SELECT t.* FROM tracks t
      INNER JOIN history h ON t.id = h.track_id
      GROUP BY t.id
      ORDER BY MAX(h.played_at) DESC
      LIMIT ?
    `, [limit]);
  } catch (e) {
    console.warn("Failed to get recently played tracks:", e);
    return [];
  }
}

export interface DBEqualizerSettings {
  enabled: boolean;
  presetName: string;
  preamp: number;
  bands: number[];
}

export function getEqualizerSettings(): DBEqualizerSettings | null {
  try {
    const row = db.getFirstSync<{
      id: string;
      enabled: number;
      preset_name: string;
      preamp: number;
      bands_json: string;
    }>('SELECT * FROM equalizer_settings WHERE id = "current"');

    if (!row) return null;

    return {
      enabled: row.enabled === 1,
      presetName: row.preset_name,
      preamp: row.preamp,
      bands: JSON.parse(row.bands_json),
    };
  } catch (e) {
    console.warn("Failed to get equalizer settings from SQLite:", e);
    return null;
  }
}

export function saveEqualizerSettings(settings: DBEqualizerSettings) {
  try {
    const statement = db.prepareSync(`
      INSERT OR REPLACE INTO equalizer_settings (id, enabled, preset_name, preamp, bands_json, updated_at)
      VALUES ("current", ?, ?, ?, ?, ?)
    `);
    statement.executeSync([
      settings.enabled ? 1 : 0,
      settings.presetName,
      settings.preamp,
      JSON.stringify(settings.bands),
      Date.now(),
    ]);
  } catch (e) {
    console.warn("Failed to save equalizer settings to SQLite:", e);
  }
}
