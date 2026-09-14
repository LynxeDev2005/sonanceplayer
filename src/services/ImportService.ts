import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { copyFileToLocal, saveArtwork, listLocalTrackFiles, TRACKS_DIR } from '../data/storage';
import { insertTracksBatch, getAllTracks, DBTrack } from '../data/database';
import { extractMetadata } from '../../modules/sonance-audio/src';
import * as Crypto from 'expo-crypto';

export type ImportProgressCallback = (
  current: number,
  total: number,
  currentName: string,
  isDuplicate?: boolean
) => void;

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
 * Executes async tasks with a maximum concurrency pool (6 parallel workers)
 */
async function runConcurrentPool<T, R>(
  items: T[],
  concurrency: number,
  workerFn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await workerFn(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Imports audio files selected from iOS Files / iCloud Drive
 * Handles multi-select with instant parallel duplicate detection and 6-worker concurrent processing
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

  const totalAssets = result.assets.length;
  const duplicateNames: string[] = [];
  const assetsToImport: { asset: (typeof result.assets)[0]; safeName: string; cleanFileName: string; normalizedName: string }[] = [];

  // 1. Fast O(1) Duplicate Pre-Filtering
  for (let i = 0; i < totalAssets; i++) {
    const asset = result.assets[i];
    if (!asset.name || !asset.uri) continue;

    const safeName = asset.name.replace(/[/\\?%*:|"<>]/g, '_');
    const cleanFileName = asset.name.replace(/\.[^/.]+$/, '');
    const normalizedName = normalizeString(cleanFileName);

    const isDuplicate =
      existingFileNames.has(safeName.toLowerCase()) ||
      (normalizedName.length > 2 && existingNormalizedTitles.has(normalizedName));

    if (isDuplicate) {
      duplicateNames.push(asset.name);
      if (onProgress) {
        onProgress(duplicateNames.length + assetsToImport.length, totalAssets, `Duplicate skipped: ${asset.name}`, true);
      }
    } else {
      existingFileNames.add(safeName.toLowerCase());
      if (normalizedName.length > 2) existingNormalizedTitles.add(normalizedName);
      assetsToImport.push({ asset, safeName, cleanFileName, normalizedName });
    }
  }

  const duplicateCount = duplicateNames.length;
  let processedCount = duplicateCount;
  const importedTracks: DBTrack[] = [];

  // 2. Multi-Worker Concurrent Processing (6 parallel workers)
  const CONCURRENCY = 6;

  await runConcurrentPool(assetsToImport, CONCURRENCY, async (item) => {
    const { asset, cleanFileName } = item;

    try {
      const localFilePath = await copyFileToLocal(asset.uri, asset.name);

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
        } catch (artErr) {
          console.warn('Failed to save artwork thumbnail:', artErr);
        }
      }

      let title = metadata.title;
      let artist = metadata.artist;

      if (!title || title.toLowerCase() === 'unknown' || title.toLowerCase() === 'unknown title') {
        if (cleanFileName.includes(' - ')) {
          const parts = cleanFileName.split(' - ');
          artist = !artist || artist.toLowerCase().includes('unknown') ? parts[0].trim() : artist;
          title = parts.slice(1).join(' - ').trim();
        } else {
          title = cleanFileName;
        }
      }

      if (!artist || artist.toLowerCase() === 'unknown') {
        artist = 'Unknown Artist';
      }

      const dbTrack: DBTrack = {
        id: trackId,
        title: title || cleanFileName || 'Audio Track',
        artist: artist || 'Unknown Artist',
        album: metadata.album || 'Unknown Album',
        duration: metadata.duration || 0,
        file_path: localFilePath,
        artwork_path: artworkPath,
        added_at: Date.now(),
      };

      importedTracks.push(dbTrack);
    } catch (error) {
      console.error(`Failed to import track ${asset.name}:`, error);
    } finally {
      processedCount++;
      if (onProgress) {
        onProgress(processedCount, totalAssets, `Imported: ${asset.name}`);
      }
    }
  });

  // 3. Batch Commit all imported tracks in a single atomic SQLite transaction
  if (importedTracks.length > 0) {
    insertTracksBatch(importedTracks);
  }

  return {
    importedCount: importedTracks.length,
    duplicateCount,
    duplicateNames,
    totalSelected: totalAssets,
  };
}

/**
 * Automatically scans local device audio directory for unindexed audio files with concurrency
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

  const totalFiles = unindexedFiles.length;
  let processedCount = 0;
  const importedTracks: DBTrack[] = [];

  const CONCURRENCY = 6;

  await runConcurrentPool(unindexedFiles, CONCURRENCY, async (fileName) => {
    const localFilePath = TRACKS_DIR + fileName;

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

      const cleanFileName = fileName.replace(/\.[^/.]+$/, '');
      let title = metadata.title;
      let artist = metadata.artist;

      if (!title || title.toLowerCase() === 'unknown') {
        if (cleanFileName.includes(' - ')) {
          const parts = cleanFileName.split(' - ');
          artist = !artist || artist.toLowerCase().includes('unknown') ? parts[0].trim() : artist;
          title = parts.slice(1).join(' - ').trim();
        } else {
          title = cleanFileName;
        }
      }

      const dbTrack: DBTrack = {
        id: trackId,
        title: title || cleanFileName || 'Audio Track',
        artist: artist || 'Unknown Artist',
        album: metadata.album || 'Unknown Album',
        duration: metadata.duration || 0,
        file_path: localFilePath,
        artwork_path: artworkPath,
        added_at: Date.now(),
      };

      importedTracks.push(dbTrack);
    } catch (e) {
      console.warn('Failed to index local file:', fileName, e);
    } finally {
      processedCount++;
      if (onProgress) {
        onProgress(processedCount, totalFiles, `Scanning: ${fileName}`);
      }
    }
  });

  if (importedTracks.length > 0) {
    insertTracksBatch(importedTracks);
  }

  return {
    importedCount: importedTracks.length,
    duplicateCount: localFiles.length - unindexedFiles.length,
    duplicateNames: [],
    totalSelected: localFiles.length,
  };
}

/**
 * Scans a selected folder (and all nested subfolders) for audio files with 6-worker concurrency and duplicate avoidance
 */
export async function scanFolderAndImport(onProgress?: ImportProgressCallback): Promise<ImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['*/*', 'public.folder', 'public.audio'],
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

  const audioExtensions = new Set(['.mp3', '.m4a', '.flac', '.wav', '.aac', '.ogg', '.aiff', '.alac', '.opus']);
  const collectedFiles: { name: string; uri: string }[] = [];

  // Recursive directory walker
  async function scanEntryRecursively(uri: string, name: string) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.isDirectory) {
        const entries = await FileSystem.readDirectoryAsync(uri);
        for (const childName of entries) {
          const childUri = uri.endsWith('/') ? uri + childName : `${uri}/${childName}`;
          await scanEntryRecursively(childUri, childName);
        }
      } else {
        const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
        if (audioExtensions.has(ext)) {
          collectedFiles.push({ name, uri });
        }
      }
    } catch {
      const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
      if (audioExtensions.has(ext)) {
        collectedFiles.push({ name, uri });
      }
    }
  }

  if (onProgress) {
    onProgress(0, result.assets.length, 'Scanning folders for audio files...');
  }

  for (const asset of result.assets) {
    if (asset.uri && asset.name) {
      await scanEntryRecursively(asset.uri, asset.name);
    }
  }

  if (collectedFiles.length === 0) {
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

  const totalDiscovered = collectedFiles.length;
  const duplicateNames: string[] = [];
  const filesToImport: { name: string; uri: string; cleanFileName: string; safeName: string; normalizedName: string }[] = [];

  // 1. Fast O(1) Duplicate Pre-Filtering
  for (let i = 0; i < totalDiscovered; i++) {
    const item = collectedFiles[i];
    const safeName = item.name.replace(/[/\\?%*:|"<>]/g, '_');
    const cleanFileName = item.name.replace(/\.[^/.]+$/, '');
    const normalizedName = normalizeString(cleanFileName);

    const isDuplicate =
      existingFileNames.has(safeName.toLowerCase()) ||
      (normalizedName.length > 2 && existingNormalizedTitles.has(normalizedName));

    if (isDuplicate) {
      duplicateNames.push(item.name);
      if (onProgress) {
        onProgress(duplicateNames.length + filesToImport.length, totalDiscovered, `Duplicate skipped: ${item.name}`, true);
      }
    } else {
      existingFileNames.add(safeName.toLowerCase());
      if (normalizedName.length > 2) existingNormalizedTitles.add(normalizedName);
      filesToImport.push({ name: item.name, uri: item.uri, cleanFileName, safeName, normalizedName });
    }
  }

  const duplicateCount = duplicateNames.length;
  let processedCount = duplicateCount;
  const importedTracks: DBTrack[] = [];

  // 2. Parallel 6-worker concurrency pool
  const CONCURRENCY = 6;

  await runConcurrentPool(filesToImport, CONCURRENCY, async (item) => {
    const { name, uri, cleanFileName } = item;

    try {
      const localFilePath = await copyFileToLocal(uri, name);

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
        } catch (artErr) {
          console.warn('Failed to save artwork thumbnail:', artErr);
        }
      }

      let title = metadata.title;
      let artist = metadata.artist;

      if (!title || title.toLowerCase() === 'unknown' || title.toLowerCase() === 'unknown title') {
        if (cleanFileName.includes(' - ')) {
          const parts = cleanFileName.split(' - ');
          artist = !artist || artist.toLowerCase().includes('unknown') ? parts[0].trim() : artist;
          title = parts.slice(1).join(' - ').trim();
        } else {
          title = cleanFileName;
        }
      }

      if (!artist || artist.toLowerCase() === 'unknown') {
        artist = 'Unknown Artist';
      }

      const dbTrack: DBTrack = {
        id: trackId,
        title: title || cleanFileName || 'Audio Track',
        artist: artist || 'Unknown Artist',
        album: metadata.album || 'Scanned Folder',
        duration: metadata.duration || 0,
        file_path: localFilePath,
        artwork_path: artworkPath,
        added_at: Date.now(),
      };

      importedTracks.push(dbTrack);
    } catch (error) {
      console.error(`Failed to import track ${name}:`, error);
    } finally {
      processedCount++;
      if (onProgress) {
        onProgress(processedCount, totalDiscovered, `Imported: ${name}`);
      }
    }
  });

  // 3. Batch commit to SQLite in single atomic transaction
  if (importedTracks.length > 0) {
    insertTracksBatch(importedTracks);
  }

  return {
    importedCount: importedTracks.length,
    duplicateCount,
    duplicateNames,
    totalSelected: totalDiscovered,
  };
}
