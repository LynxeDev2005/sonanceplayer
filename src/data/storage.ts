import * as FileSystem from 'expo-file-system/legacy';

// @ts-ignore
const docDir = FileSystem.documentDirectory || 'file:///tmp/';
export const TRACKS_DIR = docDir + 'tracks/';
export const ARTWORK_DIR = docDir + 'artwork/';

export async function initStorage() {
  try {
    const tracksDirInfo = await FileSystem.getInfoAsync(TRACKS_DIR);
    if (!tracksDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(TRACKS_DIR, { intermediates: true });
    }

    const artworkDirInfo = await FileSystem.getInfoAsync(ARTWORK_DIR);
    if (!artworkDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(ARTWORK_DIR, { intermediates: true });
    }
  } catch (e) {
    console.warn("Storage init warning:", e);
  }
}

export async function copyFileToLocal(sourceUri: string, filename: string): Promise<string> {
  await initStorage();
  
  // Sanitize filename to avoid invalid characters
  const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '_');
  const destPath = TRACKS_DIR + safeFilename;

  // If already at destination, verify and return
  if (sourceUri === destPath) {
    return destPath;
  }

  try {
    const existingInfo = await FileSystem.getInfoAsync(destPath);
    if (existingInfo.exists) {
      await FileSystem.deleteAsync(destPath);
    }
  } catch (e) {}

  await FileSystem.copyAsync({
    from: sourceUri,
    to: destPath,
  });

  const destInfo = await FileSystem.getInfoAsync(destPath);
  if (!destInfo.exists) {
    throw new Error(`Failed to copy audio file to local storage: ${destPath}`);
  }
  
  return destPath;
}

export async function saveArtwork(base64Data: string, trackId: string): Promise<string> {
  await initStorage();
  const destPath = ARTWORK_DIR + trackId + '.jpg';
  await FileSystem.writeAsStringAsync(destPath, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return destPath;
}

export async function listLocalTrackFiles(): Promise<string[]> {
  await initStorage();
  try {
    const files = await FileSystem.readDirectoryAsync(TRACKS_DIR);
    return files;
  } catch (e) {
    return [];
  }
}

export async function deleteTrackFile(filePath: string) {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists) {
      await FileSystem.deleteAsync(filePath);
    }
  } catch (e) {
    console.warn("Failed to delete track file:", filePath, e);
  }
}
