import * as SQLite from 'expo-sqlite';
import { resolveTrackPath, resolveArtworkPath, TRACKS_DIR, deleteTrackFile } from './storage';

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
  replaygain_track_gain?: number | null;
  replaygain_track_peak?: number | null;
  replaygain_album_gain?: number | null;
  replaygain_album_peak?: number | null;
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
        added_at INTEGER NOT NULL,
        replaygain_track_gain REAL,
        replaygain_track_peak REAL,
        replaygain_album_gain REAL,
        replaygain_album_peak REAL
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

      CREATE TABLE IF NOT EXISTS audio_engine_settings (
        id TEXT PRIMARY KEY NOT NULL,
        replaygain_mode TEXT NOT NULL,
        replaygain_preamp REAL NOT NULL,
        replaygain_prevent_clipping INTEGER NOT NULL,
        gapless_enabled INTEGER NOT NULL,
        crossfade_duration REAL NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS playback_session (
        id TEXT PRIMARY KEY NOT NULL,
        queue_json TEXT NOT NULL,
        current_index INTEGER NOT NULL,
        position REAL NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS visual_settings (
        id TEXT PRIMARY KEY NOT NULL,
        milky_ripples TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
      CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
      CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
      CREATE INDEX IF NOT EXISTS idx_history_track ON history(track_id);
    `);

    // Defensive migration for existing installations
    try { db.execSync('ALTER TABLE tracks ADD COLUMN replaygain_track_gain REAL;'); } catch (e) {}
    try { db.execSync('ALTER TABLE tracks ADD COLUMN replaygain_track_peak REAL;'); } catch (e) {}
    try { db.execSync('ALTER TABLE tracks ADD COLUMN replaygain_album_gain REAL;'); } catch (e) {}
    try { db.execSync('ALTER TABLE tracks ADD COLUMN replaygain_album_peak REAL;'); } catch (e) {}

    // Auto-heal any container path UUID shifts from iOS app sideloading/updating
    healDatabaseContainerPaths();

    // Auto-heal any imported tracks that were saved as 'Unknown'
    fixUnknownTracks();
  } catch (e) {
    console.error("Database initialization error:", e);
  }
}

/**
 * Automatically rewrites container paths when iOS changes the sandbox UUID during sideloading or updates
 */
export function healDatabaseContainerPaths() {
  try {
    const tracks = db.getAllSync<DBTrack>('SELECT id, file_path, artwork_path FROM tracks');
    if (!tracks || tracks.length === 0) return;

    let needsHeal = false;
    for (const t of tracks) {
      if (t.file_path && !t.file_path.startsWith('http') && !t.file_path.startsWith(TRACKS_DIR)) {
        needsHeal = true;
        break;
      }
    }

    if (needsHeal) {
      db.withTransactionSync(() => {
        const statement = db.prepareSync('UPDATE tracks SET file_path = ?, artwork_path = ? WHERE id = ?');
        for (const t of tracks) {
          const resolvedFilePath = resolveTrackPath(t.file_path);
          const resolvedArtworkPath = resolveArtworkPath(t.artwork_path);
          statement.executeSync([resolvedFilePath, resolvedArtworkPath, t.id]);
        }
      });
      console.log(`✓ Healed container paths for ${tracks.length} tracks to current sandbox.`);
    }
  } catch (e) {
    console.warn('Failed to heal database container paths:', e);
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

type DeletionHandler = (trackId?: string) => void;
const deletionHandlers: Set<DeletionHandler> = new Set();

export function onDatabaseTrackDeleted(handler: DeletionHandler) {
  deletionHandlers.add(handler);
  return () => {
    deletionHandlers.delete(handler);
  };
}

export function clearAllTracks() {
  try {
    db.execSync('DELETE FROM tracks; DELETE FROM history; DELETE FROM playlist_tracks;');
    deletionHandlers.forEach((h) => {
      try { h(); } catch (e) {}
    });
  } catch (e) {
    console.warn("Failed to clear tracks:", e);
  }
}

export function deleteTrack(trackId: string) {
  try {
    const track = db.getFirstSync<DBTrack>('SELECT * FROM tracks WHERE id = ?', [trackId]);
    if (track) {
      deleteTrackFile(track.file_path);
    }
    db.runSync('DELETE FROM tracks WHERE id = ?', [trackId]);
    db.runSync('DELETE FROM history WHERE track_id = ?', [trackId]);
    db.runSync('DELETE FROM playlist_tracks WHERE track_id = ?', [trackId]);
    
    deletionHandlers.forEach((h) => {
      try { h(trackId); } catch (e) {}
    });
  } catch (e) {
    console.warn("Failed to delete track:", e);
  }
}

export function insertTrack(track: DBTrack) {
  try {
    const statement = db.prepareSync(
      `INSERT OR REPLACE INTO tracks (
        id, title, artist, album, duration, file_path, artwork_path, added_at,
        replaygain_track_gain, replaygain_track_peak, replaygain_album_gain, replaygain_album_peak
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    statement.executeSync([
      track.id,
      track.title,
      track.artist,
      track.album,
      track.duration,
      resolveTrackPath(track.file_path),
      resolveArtworkPath(track.artwork_path),
      track.added_at,
      track.replaygain_track_gain ?? null,
      track.replaygain_track_peak ?? null,
      track.replaygain_album_gain ?? null,
      track.replaygain_album_peak ?? null,
    ]);
  } catch (e) {
    console.warn("Failed to insert track:", e);
  }
}

export function insertTracksBatch(tracks: DBTrack[]) {
  if (!tracks || tracks.length === 0) return;
  try {
    db.withTransactionSync(() => {
      const statement = db.prepareSync(
        `INSERT OR REPLACE INTO tracks (
          id, title, artist, album, duration, file_path, artwork_path, added_at,
          replaygain_track_gain, replaygain_track_peak, replaygain_album_gain, replaygain_album_peak
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const track of tracks) {
        statement.executeSync([
          track.id,
          track.title,
          track.artist,
          track.album,
          track.duration,
          resolveTrackPath(track.file_path),
          resolveArtworkPath(track.artwork_path),
          track.added_at,
          track.replaygain_track_gain ?? null,
          track.replaygain_track_peak ?? null,
          track.replaygain_album_gain ?? null,
          track.replaygain_album_peak ?? null,
        ]);
      }
    });
  } catch (e) {
    console.warn("Failed to batch insert tracks:", e);
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

function mapTrackRow(row: DBTrack): DBTrack {
  return {
    ...row,
    file_path: resolveTrackPath(row.file_path),
    artwork_path: resolveArtworkPath(row.artwork_path),
  };
}

export function getAllTracks(): DBTrack[] {
  try {
    const rows = db.getAllSync<DBTrack>('SELECT * FROM tracks ORDER BY title ASC');
    return rows.map(mapTrackRow);
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

export interface AudioEngineSettings {
  replayGainMode: 'off' | 'track' | 'album';
  replayGainPreamp: number; // -6 to +6 dB
  replayGainPreventClipping: boolean;
  gaplessEnabled: boolean;
  crossfadeDuration: number; // 0 to 12s
}

export const DEFAULT_AUDIO_ENGINE_SETTINGS: AudioEngineSettings = {
  replayGainMode: 'off',
  replayGainPreamp: 0,
  replayGainPreventClipping: true,
  gaplessEnabled: true,
  crossfadeDuration: 0,
};

export function getAudioEngineSettings(): AudioEngineSettings {
  try {
    const row = db.getFirstSync<{
      replaygain_mode: string;
      replaygain_preamp: number;
      replaygain_prevent_clipping: number;
      gapless_enabled: number;
      crossfade_duration: number;
    }>('SELECT * FROM audio_engine_settings WHERE id = "current"');

    if (!row) return DEFAULT_AUDIO_ENGINE_SETTINGS;

    return {
      replayGainMode: (row.replaygain_mode as any) || 'off',
      replayGainPreamp: row.replaygain_preamp ?? 0,
      replayGainPreventClipping: row.replaygain_prevent_clipping === 1,
      gaplessEnabled: row.gapless_enabled !== 0,
      crossfadeDuration: row.crossfade_duration ?? 0,
    };
  } catch (e) {
    return DEFAULT_AUDIO_ENGINE_SETTINGS;
  }
}

export function saveAudioEngineSettings(settings: AudioEngineSettings) {
  try {
    const stmt = db.prepareSync(`
      INSERT OR REPLACE INTO audio_engine_settings (
        id, replaygain_mode, replaygain_preamp, replaygain_prevent_clipping, gapless_enabled, crossfade_duration, updated_at
      ) VALUES ("current", ?, ?, ?, ?, ?, ?)
    `);
    stmt.executeSync([
      settings.replayGainMode,
      settings.replayGainPreamp,
      settings.replayGainPreventClipping ? 1 : 0,
      settings.gaplessEnabled ? 1 : 0,
      settings.crossfadeDuration,
      Date.now(),
    ]);
  } catch (e) {
    console.warn('Failed to save audio engine settings:', e);
  }
}

export interface PlaybackSession {
  queue: any[];
  currentIndex: number;
  position: number;
}

export function savePlaybackSession(session: PlaybackSession) {
  try {
    const stmt = db.prepareSync(`
      INSERT OR REPLACE INTO playback_session (id, queue_json, current_index, position, updated_at)
      VALUES ("current", ?, ?, ?, ?)
    `);
    stmt.executeSync([
      JSON.stringify(session.queue || []),
      session.currentIndex ?? 0,
      session.position ?? 0,
      Date.now(),
    ]);
  } catch (e) {
    console.warn('Failed to save playback session:', e);
  }
}

export function loadPlaybackSession(): PlaybackSession | null {
  try {
    const row = db.getFirstSync<{
      queue_json: string;
      current_index: number;
      position: number;
    }>('SELECT * FROM playback_session WHERE id = "current"');

    if (!row) return null;
    const queue = JSON.parse(row.queue_json || '[]');
    const resolvedQueue = queue.map((t: any) => ({
      ...t,
      filePath: resolveTrackPath(t.filePath || t.file_path),
      artworkUrl: resolveArtworkPath(t.artworkUrl || t.artwork_path),
    }));
    return {
      queue: resolvedQueue,
      currentIndex: row.current_index,
      position: row.position,
    };
  } catch (e) {
    return null;
  }
}

export interface VisualSettings {
  milkyRipples: 'off' | 'subtle' | 'expressive';
}

export const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  milkyRipples: 'expressive',
};

export function getVisualSettings(): VisualSettings {
  try {
    const row = db.getFirstSync<{ milky_ripples: string }>('SELECT milky_ripples FROM visual_settings WHERE id = "current"');
    if (row && (row.milky_ripples === 'off' || row.milky_ripples === 'subtle' || row.milky_ripples === 'expressive')) {
      return { milkyRipples: row.milky_ripples as any };
    }
    return DEFAULT_VISUAL_SETTINGS;
  } catch (e) {
    return DEFAULT_VISUAL_SETTINGS;
  }
}

export function saveVisualSettings(settings: VisualSettings) {
  try {
    const stmt = db.prepareSync(`
      INSERT OR REPLACE INTO visual_settings (id, milky_ripples, updated_at)
      VALUES ("current", ?, ?)
    `);
    stmt.executeSync([settings.milkyRipples, Date.now()]);
  } catch (e) {
    console.warn('Failed to save visual settings:', e);
  }
}


