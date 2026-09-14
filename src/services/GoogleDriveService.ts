import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { TRACKS_DIR, saveArtwork, initStorage } from '../data/storage';
import { getAllTracks, insertTracksBatch, DBTrack } from '../data/database';
import { extractMetadata } from '../../modules/sonance-audio/src';

WebBrowser.maybeCompleteAuthSession();

const BUILTIN_ID_PARTS = ['146606044771', 'gf8g6dth3aagjdo8m56ofrqs07k3ifq1', 'apps.googleusercontent.com'];
export const BUILTIN_GOOGLE_CLIENT_ID = `${BUILTIN_ID_PARTS[0]}-${BUILTIN_ID_PARTS[1]}.${BUILTIN_ID_PARTS[2]}`;

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  isFolder: boolean;
}

export interface DriveUser {
  email: string;
  name: string;
  picture?: string;
}

export interface DriveImportProgress {
  current: number;
  total: number;
  fileName: string;
  isDuplicate?: boolean;
}

interface CachedSession {
  clientId: string;
  clientSecret?: string;
  accessToken: string;
  user: DriveUser | null;
  savedAt: number;
}

const SESSION_FILE = (FileSystem.documentDirectory || 'file:///tmp/') + 'gdrive_session.json';

class GoogleDriveServiceClass {
  private customClientId: string = BUILTIN_GOOGLE_CLIENT_ID;
  private customClientSecret: string = '';
  private accessToken: string | null = null;
  private currentUser: DriveUser | null = null;

  constructor() {
    this.loadCachedSession();
  }

  /**
   * Loads persisted Google Drive session from local storage
   */
  public async loadCachedSession(): Promise<{ accessToken: string | null; user: DriveUser | null; clientId: string }> {
    try {
      const info = await FileSystem.getInfoAsync(SESSION_FILE);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(SESSION_FILE);
        const data: CachedSession = JSON.parse(content);
        if (data && data.accessToken) {
          this.accessToken = data.accessToken;
          this.currentUser = data.user;
          if (data.clientId) {
            this.customClientId = data.clientId;
          }
          if (data.clientSecret) {
            this.customClientSecret = data.clientSecret;
          }
          return { accessToken: this.accessToken, user: this.currentUser, clientId: this.customClientId };
        }
      }
    } catch (e) {
      console.warn('Failed to load cached Google Drive session:', e);
    }
    return { accessToken: null, user: null, clientId: this.customClientId };
  }

  /**
   * Saves current Google Drive session to persistent local file
   */
  public async saveSessionToStorage() {
    try {
      const sessionData: CachedSession = {
        clientId: this.customClientId,
        clientSecret: this.customClientSecret,
        accessToken: this.accessToken || '',
        user: this.currentUser,
        savedAt: Date.now(),
      };
      await FileSystem.writeAsStringAsync(SESSION_FILE, JSON.stringify(sessionData));
    } catch (e) {
      console.warn('Failed to save Google Drive session:', e);
    }
  }

  /**
   * Clears saved session from persistent local file
   */
  public async clearCachedSession() {
    try {
      const info = await FileSystem.getInfoAsync(SESSION_FILE);
      if (info.exists) {
        await FileSystem.deleteAsync(SESSION_FILE);
      }
    } catch (e) {
      console.warn('Failed to delete Google Drive session:', e);
    }
  }

  public setCustomClientId(clientId: string) {
    this.customClientId = clientId.trim() || BUILTIN_GOOGLE_CLIENT_ID;
    this.saveSessionToStorage();
  }

  public getCustomClientId(): string {
    return this.customClientId;
  }

  public setCustomClientSecret(secret: string) {
    this.customClientSecret = secret.trim();
    this.saveSessionToStorage();
  }

  public getCustomClientSecret(): string {
    return this.customClientSecret;
  }

  public isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  public getCurrentUser(): DriveUser | null {
    return this.currentUser;
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  public async setSession(token: string, user: DriveUser | null, clientId?: string) {
    this.accessToken = token;
    this.currentUser = user;
    if (clientId) {
      this.customClientId = clientId;
    }
    await this.saveSessionToStorage();
  }

  public async signOut() {
    this.accessToken = null;
    this.currentUser = null;
    await this.clearCachedSession();
  }

  /**
   * Generates the OAuth redirect URI for Sonance (complies with Google iOS Native RFC 8252 policy)
   */
  public getRedirectUri(clientId?: string): string {
    const id = clientId || this.customClientId;
    if (id && id.includes('.apps.googleusercontent.com')) {
      const prefix = id.replace('.apps.googleusercontent.com', '');
      return `com.googleusercontent.apps.${prefix}:/oauthredirect`;
    }
    return AuthSession.makeRedirectUri({
      scheme: 'sonance',
      path: 'oauthredirect',
    });
  }

  /**
   * Direct streaming media URL for online AVPlayer streaming
   */
  public getStreamUrl(fileId: string): string {
    if (!this.accessToken) {
      return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    }
    return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${encodeURIComponent(this.accessToken)}`;
  }

  /**
   * Exchanges an authorization code for an access token
   */
  public async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<string> {
    const bodyObj: Record<string, string> = {
      client_id: this.customClientId,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    };
    if (this.customClientSecret) {
      bodyObj.client_secret = this.customClientSecret;
    }
    if (codeVerifier) {
      bodyObj.code_verifier = codeVerifier;
    }

    const formBody = Object.keys(bodyObj)
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(bodyObj[k]))
      .join('&');

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error_description || errData.error || `HTTP ${res.status}: Failed to exchange token`);
    }

    const tokenData = await res.json();
    return tokenData.access_token;
  }

  /**
   * Fetches the user profile associated with the access token
   */
  public async fetchUserProfile(token: string): Promise<DriveUser> {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch user profile: ${res.statusText}`);
    }
    const data = await res.json();
    return {
      email: data.email || '',
      name: data.name || 'Google User',
      picture: data.picture,
    };
  }

  /**
   * Lists audio files and folders in a specific Google Drive directory
   */
  public async listFiles(folderId: string = 'root', searchQuery?: string): Promise<DriveFile[]> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Google Drive.');
    }

    let q = `'${folderId}' in parents and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'audio/' or name contains '.mp3' or name contains '.flac' or name contains '.m4a' or name contains '.wav' or name contains '.aac' or name contains '.ogg')`;

    if (searchQuery && searchQuery.trim()) {
      const cleanSearch = searchQuery.replace(/'/g, "\\'");
      q += ` and name contains '${cleanSearch}'`;
    }

    const fields = 'files(id, name, mimeType, size, modifiedTime, thumbnailLink)';
    const orderBy = 'folder,name asc';
    const pageSize = 100;

    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=${encodeURIComponent(orderBy)}&pageSize=${pageSize}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        this.signOut();
        throw new Error('Google Drive session expired. Please sign in again.');
      }
      throw new Error(`Failed to fetch Drive files: ${res.statusText}`);
    }

    const data = await res.json();
    const files: DriveFile[] = (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      modifiedTime: f.modifiedTime,
      thumbnailLink: f.thumbnailLink,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    }));

    return files;
  }

  /**
   * Normalizes title for duplicate matching
   */
  public normalizeString(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  }

  /**
   * Checks if a file is already downloaded into the local library
   */
  public isTrackInLibrary(fileName: string, title?: string): boolean {
    try {
      const tracks = getAllTracks();
      const safeName = fileName.replace(/[/\\?%*:|"<>]/g, '_').toLowerCase();
      const normalizedTitle = this.normalizeString(title || fileName.replace(/\.[^/.]+$/, ''));

      for (const t of tracks) {
        const localName = (t.file_path.split('/').pop()?.split('\\').pop() || '').toLowerCase();
        if (localName === safeName) return true;
        if (normalizedTitle.length > 2 && this.normalizeString(t.title) === normalizedTitle) return true;
      }
    } catch (e) {}
    return false;
  }

  /**
   * Downloads and imports a single Google Drive track directly to local storage & SQLite
   */
  public async downloadSingleTrack(file: DriveFile): Promise<DBTrack> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Google Drive.');
    }
    await initStorage();

    const safeName = file.name.replace(/[/\\?%*:|"<>]/g, '_');
    const cleanFileName = file.name.replace(/\.[^/.]+$/, '');
    const localDestPath = TRACKS_DIR + safeName;

    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    
    const downloadResult = await FileSystem.downloadAsync(
      downloadUrl,
      localDestPath,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (downloadResult.status !== 200) {
      throw new Error(`Failed to download ${file.name}, HTTP status: ${downloadResult.status}`);
    }

    const fallbackMeta = {
      title: undefined,
      artist: undefined,
      album: undefined,
      duration: 0,
      artworkBase64: undefined,
    };

    const metadata = await extractMetadata(localDestPath).catch(() => fallbackMeta);
    const trackId = Crypto.randomUUID();
    let artworkPath: string | null = null;

    if (metadata.artworkBase64) {
      try {
        artworkPath = await saveArtwork(metadata.artworkBase64, trackId);
      } catch (e) {}
    }

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
      title: title || cleanFileName || 'Drive Audio',
      artist: artist || 'Unknown Artist',
      album: metadata.album || 'Google Drive',
      duration: metadata.duration || 0,
      file_path: localDestPath,
      artwork_path: artworkPath,
      added_at: Date.now(),
    };

    insertTracksBatch([dbTrack]);
    return dbTrack;
  }

  /**
   * Downloads selected Google Drive files concurrently with 6-worker pool and automatic duplicate skipping
   */
  public async downloadAndImportDriveTracks(
    files: DriveFile[],
    onProgress?: (progress: DriveImportProgress) => void
  ): Promise<{ importedCount: number; duplicateCount: number; duplicateNames: string[] }> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Google Drive.');
    }

    await initStorage();

    const existingTracks = getAllTracks();
    const existingFileNames = new Set(
      existingTracks.map((t) => (t.file_path.split('/').pop()?.split('\\').pop() || '').toLowerCase())
    );
    const existingNormalizedTitles = new Set(
      existingTracks.map((t) => this.normalizeString(t.title))
    );

    const duplicateNames: string[] = [];
    const filesToDownload: DriveFile[] = [];

    // 1. Fast O(1) Duplicate Pre-check
    for (const file of files) {
      if (file.isFolder) continue;

      const safeName = file.name.replace(/[/\\?%*:|"<>]/g, '_');
      const cleanFileName = file.name.replace(/\.[^/.]+$/, '');
      const normalizedName = this.normalizeString(cleanFileName);

      const isDuplicate =
        existingFileNames.has(safeName.toLowerCase()) ||
        (normalizedName.length > 2 && existingNormalizedTitles.has(normalizedName));

      if (isDuplicate) {
        duplicateNames.push(file.name);
        if (onProgress) {
          onProgress({
            current: duplicateNames.length + filesToDownload.length,
            total: files.length,
            fileName: file.name,
            isDuplicate: true,
          });
        }
      } else {
        existingFileNames.add(safeName.toLowerCase());
        if (normalizedName.length > 2) existingNormalizedTitles.add(normalizedName);
        filesToDownload.push(file);
      }
    }

    const duplicateCount = duplicateNames.length;
    let processedCount = duplicateCount;
    const importedTracks: DBTrack[] = [];

    // 2. Parallel 6-worker concurrency pool for downloading and processing
    const CONCURRENCY = 6;
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < filesToDownload.length) {
        const item = filesToDownload[nextIndex++];
        const safeName = item.name.replace(/[/\\?%*:|"<>]/g, '_');
        const cleanFileName = item.name.replace(/\.[^/.]+$/, '');
        const localDestPath = TRACKS_DIR + safeName;

        try {
          // Download directly from Google Drive API
          const downloadUrl = `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`;
          
          const downloadResult = await FileSystem.downloadAsync(
            downloadUrl,
            localDestPath,
            {
              headers: {
                Authorization: `Bearer ${this.accessToken}`,
              },
            }
          );

          if (downloadResult.status !== 200) {
            console.warn(`Failed to download ${item.name}, HTTP status:`, downloadResult.status);
            continue;
          }

          // Native metadata extraction
          const fallbackMeta = {
            title: undefined,
            artist: undefined,
            album: undefined,
            duration: 0,
            artworkBase64: undefined,
          };

          const metadata = await extractMetadata(localDestPath).catch(() => fallbackMeta);
          const trackId = Crypto.randomUUID();
          let artworkPath: string | null = null;

          if (metadata.artworkBase64) {
            try {
              artworkPath = await saveArtwork(metadata.artworkBase64, trackId);
            } catch (e) {}
          }

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
            title: title || cleanFileName || 'Drive Audio',
            artist: artist || 'Unknown Artist',
            album: metadata.album || 'Google Drive',
            duration: metadata.duration || 0,
            file_path: localDestPath,
            artwork_path: artworkPath,
            added_at: Date.now(),
          };

          importedTracks.push(dbTrack);
        } catch (err) {
          console.error(`Failed to download and import Drive file ${item.name}:`, err);
        } finally {
          processedCount++;
          if (onProgress) {
            onProgress({
              current: processedCount,
              total: files.length,
              fileName: item.name,
            });
          }
        }
      }
    };

    const workerCount = Math.min(CONCURRENCY, filesToDownload.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    // 3. Batch commit to SQLite
    if (importedTracks.length > 0) {
      insertTracksBatch(importedTracks);
    }

    return {
      importedCount: importedTracks.length,
      duplicateCount,
      duplicateNames,
    };
  }
}

export const GoogleDriveService = new GoogleDriveServiceClass();
