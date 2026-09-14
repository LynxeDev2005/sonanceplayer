import SonanceAudioModule, { TrackInfo, PlaybackState } from './SonanceAudioModule';

export function initializePlayer(): string {
  return SonanceAudioModule.initializePlayer();
}

export function play(): void {
  SonanceAudioModule.play();
}

export function pause(): void {
  SonanceAudioModule.pause();
}

export function next(): void {
  SonanceAudioModule.next();
}

export function previous(): void {
  SonanceAudioModule.previous();
}

export function seek(seconds: number): void {
  SonanceAudioModule.seek(seconds);
}

export function setShuffle(enabled: boolean): void {
  SonanceAudioModule.setShuffle(enabled);
}

export function setRepeatMode(mode: 'off' | 'track' | 'queue'): void {
  SonanceAudioModule.setRepeatMode(mode);
}

export function setEqualizerEnabled(enabled: boolean): void {
  try {
    SonanceAudioModule.setEqualizerEnabled(enabled);
  } catch (e) {
    console.warn("setEqualizerEnabled error:", e);
  }
}

export function setEqualizerBands(gains: number[], preamp: number): void {
  try {
    SonanceAudioModule.setEqualizerBands(gains, preamp);
  } catch (e) {
    console.warn("setEqualizerBands error:", e);
  }
}

export function loadTrack(track: TrackInfo): void {
  SonanceAudioModule.loadTrack(track);
}

export function setQueue(tracks: TrackInfo[], startIndex: number = 0) {
  try {
    SonanceAudioModule.setQueue(tracks, startIndex);
  } catch (e) {
    console.warn("setQueue not available in Expo Go");
  }
}

export function addToQueue(track: TrackInfo): void {
  try {
    SonanceAudioModule.addToQueue(track);
  } catch (e) {
    console.warn("addToQueue error:", e);
  }
}

export function playNext(track: TrackInfo): void {
  try {
    SonanceAudioModule.playNext(track);
  } catch (e) {
    console.warn("playNext error:", e);
  }
}

export type ExtractedMetadata = {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  artworkBase64?: string;
};

export async function extractMetadata(filePath: string): Promise<ExtractedMetadata> {
  return await SonanceAudioModule.extractMetadata(filePath);
}

export function addPlaybackListener(listener: (state: PlaybackState) => void) {
  return SonanceAudioModule.addListener('onPlaybackStateChanged', listener);
}

export { TrackInfo, PlaybackState };
