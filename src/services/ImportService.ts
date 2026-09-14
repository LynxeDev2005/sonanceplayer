import * as DocumentPicker from 'expo-document-picker';
import { copyFileToLocal, saveArtwork, listLocalTrackFiles, TRACKS_DIR } from '../data/storage';
import { insertTrack, getAllTracks } from '../data/database';
import { extractMetadata } from '../../modules/sonance-audio/src';
import * as Crypto from 'expo-crypto';

export type ImportProgressCallback = (current: number, total: number, currentName: string, isDuplicate?: boolean) => void;

export interface ImportResult {
  importedCount: number;
  duplicateCount: number;
  duplicateNames: string[];
  totalSelected: number;
}

/**
 * Timeout wrapper around async functions to prevent hanging on corrupted files
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

/**
 * Normalizes title string for duplicate matching
 */
function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Imports audio files selected from iOS Files / iCloud Drive
 * Handles multi-select with instant duplicate detection and skipping
 */
export async function importFromFiles(onProgress?: ImportProgressCallback): Promise<ImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'audio/*',
      'public.audio',
      'audio/mpeg',
      'audio/mp4',
      'audio/x-m4a',
      'audio/flac',
      'audio/wav',
      'audio/aac',
      'audio/ogg',
      'audio/x-wav',
    ],
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return {
      importedCount: 0,
      duplicateCount: 0,
      duplicateNames: [],
      totalSelected: 0,
    };
  }

  const existingTracks = getAllTracks();
  const existingFileNames = new Set(
    existingTracks.map((t) => (t.file_path.split('/').pop()?.split('\\').pop() || '').toLowerCase())
  );
  const existingNormalizedTitles = new Set(
    existingTracks.map((t) => normalizeString(t.title))
  );

  let importedCount = 0;
  let duplicateCount = 0;
  const duplicateNames: string[] = [];
  const totalAssets = result.assets.length;

  for (let i = 0; i < totalAssets; i++) {
    const asset = result.assets[i];
    if (!asset.name || !asset.uri) continue;

    const safeName = asset.name.replace(/[/\\?%*:|"<>]/g, '_');
    const cleanFileName = asset.name.replace(/\.[^/.]+$/, "");
    const normalizedName = normalizeString(cleanFileName);

    // Duplicate Detection: Check filename or normalized title
    const isDuplicate = existingFileNames.has(safeName.toLowerCase()) || (
      normalizedName.length > 2 && existingNormalizedTitles.has(normalizedName)
    );

    if (isDuplicate) {
      duplicateCount++;
      duplicateNames.push(asset.name);
      if (onProgress) {
        onProgress(i + 1, totalAssets, `Duplicate skipped: ${asset.name}`, true);
      }
      // Continue to next song without blocking the batch!
      continue;
    }

    if (onProgress) {
      onProgress(i + 1, totalAssets, `Importing ${asset.name}`);
    }

    try {
      // 1. Copy to app local storage directory
      const localFilePath = await copyFileToLocal(asset.uri, asset.name);

      // 2. Extract Metadata natively with 8-second timeout protection for large files (30min+)
      const fallbackMeta = {
        title: undefined,
        artist: undefined,
        album: undefined,
        duration: 0,
        artworkBase64: undefined,
      };

      const metadata = await withTimeout(
        extractMetadata(localFilePath).catch(() => fallbackMeta),
        8000,
        fallbackMeta
      );

      const trackId = Crypto.randomUUID();
      let artworkPath: string | null = null;

      // 3. Save Artwork if extracted
      if (metadata.artworkBase64) {
        try {
          artworkPath = await saveArtwork(metadata.artworkBase64, trackId);
        } catch (artErr) {
          console.warn("Failed to save artwork thumbnail:", artErr);
        }
      }

      // 4. Fallback parser from clean filename
      let title = metadata.title;
      let artist = metadata.artist;

      if (!title || title.toLowerCase() === 'unknown' || title.toLowerCase() === 'unknown title') {
        if (cleanFileName.includes(' - ')) {
          const parts = cleanFileName.split(' - ');
          artist = (!artist || artist.toLowerCase().includes('unknown')) ? parts[0].trim() : artist;
          title = parts.slice(1).join(' - ').trim();
        } else {
          title = cleanFileName;
        }
      }

      if (!artist || artist.toLowerCase() === 'unknown') {
        artist = 'Unknown Artist';
      }

      // 5. Insert track record into SQLite
      insertTrack({
        id: trackId,
        title: title || cleanFileName || 'Audio Track',
        artist: artist || 'Unknown Artist',
        album: metadata.album || 'Unknown Album',
        duration: metadata.duration || 0,
        file_path: localFilePath,
        artwork_path: artworkPath,
        added_at: Date.now(),
      });

      // Register into existing sets for batch uniqueness
      existingFileNames.add(safeName.toLowerCase());
      if (normalizedName) existingNormalizedTitles.add(normalizedName);
      importedCount++;
    } catch (error) {
      console.error(`Failed to import track ${asset.name}:`, error);
    }
  }

  return {
    importedCount,
    duplicateCount,
    duplicateNames,
    totalSelected: totalAssets,
  };
}

/**
 * Automatically scans local device audio directory for unindexed audio files
 */
export async function scanAndSyncLocalLibrary(onProgress?: ImportProgressCallback): Promise<ImportResult> {
  const localFiles = await listLocalTrackFiles();
  const existingTracks = getAllTracks();
  const existingFileNames = new Set(
    existingTracks.map((t) => (t.file_path.split('/').pop()?.split('\\').pop() || '').toLowerCase())
  );

  const audioExtensions = new Set(['.mp3', '.m4a', '.flac', '.wav', '.aac', '.ogg', '.aiff']);
  const unindexedFiles = localFiles.filter((fileName) => {
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    return audioExtensions.has(ext) && !existingFileNames.has(fileName.toLowerCase());
  });

  let importedCount = 0;
  const totalFiles = unindexedFiles.length;

  for (let i = 0; i < totalFiles; i++) {
    const fileName = unindexedFiles[i];
    const localFilePath = TRACKS_DIR + fileName;

    if (onProgress) {
      onProgress(i + 1, totalFiles, `Scanning ${fileName}`);
    }

    try {
      const fallbackMeta = {
        title: undefined,
        artist: undefined,
        album: undefined,
        duration: 0,
        artworkBase64: undefined,
      };

      const metadata = await withTimeout(
        extractMetadata(localFilePath).catch(() => fallbackMeta),
        8000,
        fallbackMeta
      );

      const trackId = Crypto.randomUUID();
      let artworkPath: string | null = null;

      if (metadata.artworkBase64) {
        try {
          artworkPath = await saveArtwork(metadata.artworkBase64, trackId);
        } catch (e) {}
      }

      const cleanFileName = fileName.replace(/\.[^/.]+$/, "");
      let title = metadata.title;
      let artist = metadata.artist;

      if (!title || title.toLowerCase() === 'unknown') {
        if (cleanFileName.includes(' - ')) {
          const parts = cleanFileName.split(' - ');
          artist = (!artist || artist.toLowerCase().includes('unknown')) ? parts[0].trim() : artist;
          title = parts.slice(1).join(' - ').trim();
        } else {
          title = cleanFileName;
        }
      }

      insertTrack({
        id: trackId,
        title: title || cleanFileName || 'Audio Track',
        artist: artist || 'Unknown Artist',
        album: metadata.album || 'Unknown Album',
        duration: metadata.duration || 0,
        file_path: localFilePath,
        artwork_path: artworkPath,
        added_at: Date.now(),
      });

      importedCount++;
    } catch (e) {
      console.warn("Failed to index local file:", fileName, e);
    }
  }

  return {
    importedCount,
    duplicateCount: localFiles.length - unindexedFiles.length,
    duplicateNames: [],
    totalSelected: localFiles.length,
  };
}
