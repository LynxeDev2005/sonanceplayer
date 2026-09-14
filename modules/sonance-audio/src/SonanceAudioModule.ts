import { NativeModule, requireNativeModule } from 'expo';
import { createAudioPlayer, AudioPlayer, AudioStatus, setAudioModeAsync } from 'expo-audio';
import { updateTrackDuration } from '../../../src/data/database';

export type TrackInfo = {
  id: string;
  title: string;
  artist: string;
  filePath: string;
  artworkUrl?: string;
  duration?: number;
  replayGainTrack?: number;
  replayGainAlbum?: number;
  replayGainTrackPeak?: number;
  replayGainAlbumPeak?: number;
  replaygain_track_gain?: number | null;
  replaygain_track_peak?: number | null;
  replaygain_album_gain?: number | null;
  replaygain_album_peak?: number | null;
};

export type PlaybackState = {
  isPlaying: boolean;
  currentIndex: number;
  shuffle: boolean;
  repeatMode: 'off' | 'track' | 'queue';
  position: number;
  duration: number;
  currentTrack?: TrackInfo;
  equalizer?: {
    enabled: boolean;
    bands: number[];
    preamp: number;
  };
  replayGain?: {
    mode: 'off' | 'track' | 'album';
    preamp: number;
    preventClipping: boolean;
  };
  gaplessEnabled?: boolean;
  crossfadeDuration?: number;
};

export type SonanceAudioModuleEvents = {
  onPlaybackStateChanged: (state: PlaybackState) => void;
};

declare class SonanceAudioModule extends NativeModule<SonanceAudioModuleEvents> {
  initializePlayer(): string;
  play(): void;
  pause(): void;
  stop(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  setShuffle(enabled: boolean): void;
  setRepeatMode(mode: 'off' | 'track' | 'queue'): void;
  setEqualizerEnabled(enabled: boolean): void;
  setEqualizerBands(gains: number[], preamp: number): void;
  setReplayGain(mode: 'off' | 'track' | 'album', preamp: number, preventClipping: boolean): void;
  setGaplessEnabled(enabled: boolean): void;
  setCrossfadeDuration(duration: number): void;
  loadTrack(track: TrackInfo): void;
  setQueue(tracks: TrackInfo[], startIndex: number): void;
  addToQueue(track: TrackInfo): void;
  playNext(track: TrackInfo): void;
  extractMetadata(filePath: string): Promise<{
    title?: string;
    artist?: string;
    album?: string;
    duration?: number;
    artworkBase64?: string;
    replayGainTrack?: number;
    replayGainAlbum?: number;
    replayGainTrackPeak?: number;
    replayGainAlbumPeak?: number;
  }>;
}

// Precision Fallback Engine for Expo Go
class ExpoGoAudioEngine {
  private queue: TrackInfo[] = [];
  private currentIndex: number = -1;
  private isPlaying: boolean = false;
  private shuffle: boolean = false;
  private repeatMode: 'off' | 'track' | 'queue' = 'off';
  private player: AudioPlayer | null = null;
  private listeners: Set<(state: PlaybackState) => void> = new Set();
  private requestToken: number = 0;
  private seekOverride: number | null = null;
  private duration: number = 0;
  private currentTime: number = 0;
  private lastIntentTime: number = 0;

  // ReplayGain & Playback Pipeline Settings
  private replayGainMode: 'off' | 'track' | 'album' = 'off';
  private replayGainPreamp: number = 0;
  private replayGainPreventClipping: boolean = true;
  private gaplessEnabled: boolean = true;
  private crossfadeDuration: number = 0;

  private emitState() {
    const currentTrack = this.currentIndex >= 0 && this.currentIndex < this.queue.length 
      ? this.queue[this.currentIndex] 
      : undefined;

    const currentPos = this.seekOverride !== null 
      ? this.seekOverride 
      : (this.currentTime || (this.player ? this.player.currentTime : 0));

    const totalDuration = this.duration > 0 
      ? this.duration 
      : (this.player && this.player.duration > 0 
          ? this.player.duration 
          : (currentTrack?.duration && currentTrack.duration > 0 ? currentTrack.duration : 0));

    const state: PlaybackState = {
      isPlaying: this.isPlaying,
      currentIndex: this.currentIndex,
      shuffle: this.shuffle,
      repeatMode: this.repeatMode,
      position: currentPos,
      duration: totalDuration,
      currentTrack,
      replayGain: {
        mode: this.replayGainMode,
        preamp: this.replayGainPreamp,
        preventClipping: this.replayGainPreventClipping,
      },
      gaplessEnabled: this.gaplessEnabled,
      crossfadeDuration: this.crossfadeDuration,
    };

    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (e) {
        console.error("Listener error in ExpoGoAudioEngine:", e);
      }
    });
  }

  private handleTrackEnded() {
    if (this.repeatMode === 'track') {
      this.seek(0);
      this.play();
    } else {
      this.next();
    }
  }

  public initializePlayer() {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch((e) => console.warn("Audio mode init warning:", e));
    return 'Expo Go Audio Engine Initialized';
  }

  public async setQueue(tracks: TrackInfo[], startIndex: number = 0) {
    this.queue = tracks;
    this.currentIndex = startIndex;
    await this.loadCurrentTrack(true);
  }

  public async loadTrack(track: TrackInfo) {
    this.queue = [track];
    this.currentIndex = 0;
    await this.loadCurrentTrack(true);
  }

  public addToQueue(track: TrackInfo) {
    this.queue.push(track);
    this.emitState();
  }

  public playNext(track: TrackInfo) {
    if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      this.queue.splice(this.currentIndex + 1, 0, track);
    } else {
      this.queue.push(track);
    }
    this.emitState();
  }

  private async loadCurrentTrack(autoPlay: boolean = false) {
    if (this.currentIndex < 0 || this.currentIndex >= this.queue.length) {
      return;
    }

    const currentToken = ++this.requestToken;
    const track = this.queue[this.currentIndex];
    
    // Initialize state for new track with known metadata duration
    this.duration = (track.duration && track.duration > 0) ? track.duration : 0;
    this.currentTime = 0;
    this.seekOverride = null;
    this.lastIntentTime = Date.now();
    this.isPlaying = autoPlay;

    // Synchronously dispose previous player
    if (this.player) {
      try {
        this.player.pause();
        this.player.release();
      } catch (e) {}
      this.player = null;
    }

    this.emitState();

    try {
      const audioUri = track.filePath.startsWith('file://') ? track.filePath : `file://${track.filePath}`;
      const newPlayer = createAudioPlayer({ uri: audioUri }, { updateInterval: 250 });

      if (this.requestToken !== currentToken) {
        try {
          newPlayer.pause();
          newPlayer.release();
        } catch (e) {}
        return;
      }

      this.player = newPlayer;

      // Realtime status listener from native audio
      newPlayer.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (this.requestToken !== currentToken) return;

        if (status.duration && status.duration > 0) {
          this.duration = status.duration;
          if (track.id && (!track.duration || track.duration === 0)) {
            updateTrackDuration(track.id, status.duration);
          }
        }
        if (status.currentTime !== undefined) {
          this.currentTime = status.currentTime;
        }
        
        // Auto-play buffer recovery for large/long files
        if (autoPlay && this.isPlaying && !status.playing && (Date.now() - this.lastIntentTime < 4000)) {
          try {
            newPlayer.play();
          } catch (e) {}
        }

        const timeSinceIntent = Date.now() - this.lastIntentTime;
        if (timeSinceIntent > 600) {
          this.isPlaying = status.playing;
        }

        if (status.didJustFinish) {
          this.isPlaying = false;
          this.handleTrackEnded();
        } else {
          this.emitState();
        }
      });

      if (autoPlay) {
        this.isPlaying = true;
        try {
          newPlayer.play();
        } catch (e) {}
      } else {
        this.isPlaying = false;
      }
      this.emitState();
    } catch (e) {
      console.warn("Expo Go failed to load audio file:", track.filePath, e);
    }
  }

  public play() {
    this.isPlaying = true;
    this.lastIntentTime = Date.now();
    this.emitState();

    if (this.player) {
      try {
        this.player.play();
      } catch (e) {
        console.warn("Error calling player.play():", e);
      }
    } else if (this.currentIndex >= 0) {
      this.loadCurrentTrack(true);
    }
  }

  public pause() {
    this.isPlaying = false;
    this.lastIntentTime = Date.now();
    this.emitState();

    if (this.player) {
      try {
        this.player.pause();
      } catch (e) {
        console.warn("Error calling player.pause():", e);
      }
    }
  }

  public stop() {
    this.isPlaying = false;
    this.currentIndex = -1;
    this.queue = [];
    this.duration = 0;
    this.currentTime = 0;
    this.lastIntentTime = Date.now();
    if (this.player) {
      try {
        this.player.pause();
        this.player.release();
      } catch (e) {}
      this.player = null;
    }
    this.emitState();
  }

  public next() {
    if (this.queue.length === 0) return;
    
    if (this.shuffle) {
      this.currentIndex = Math.floor(Math.random() * this.queue.length);
    } else {
      if (this.currentIndex < this.queue.length - 1) {
        this.currentIndex += 1;
      } else if (this.repeatMode === 'queue') {
        this.currentIndex = 0;
      } else {
        this.pause();
        return;
      }
    }
    this.isPlaying = true;
    this.lastIntentTime = Date.now();
    this.loadCurrentTrack(true);
  }

  public previous() {
    if (this.player && this.currentTime > 3) {
      this.seek(0);
      this.play();
      return;
    }

    if (this.currentIndex > 0) {
      this.currentIndex -= 1;
      this.isPlaying = true;
      this.lastIntentTime = Date.now();
      this.loadCurrentTrack(true);
    } else {
      this.seek(0);
      this.play();
    }
  }

  public seek(seconds: number) {
    this.seekOverride = seconds;
    this.currentTime = seconds;
    this.emitState();

    if (this.player) {
      try {
        this.player.seekTo(seconds);
      } catch (e) {
        console.warn("Error seeking in expo-audio:", e);
      }
    }

    // Keep override active for 600ms so native audio buffer updates seamlessly
    setTimeout(() => {
      this.seekOverride = null;
    }, 600);
  }

  public setShuffle(enabled: boolean) {
    this.shuffle = enabled;
    this.emitState();
  }

  public setRepeatMode(mode: 'off' | 'track' | 'queue') {
    this.repeatMode = mode;
    this.emitState();
  }

  public setEqualizerEnabled(enabled: boolean) {
    this.emitState();
  }

  public setEqualizerBands(gains: number[], preamp: number) {
    this.emitState();
  }

  public setReplayGain(mode: 'off' | 'track' | 'album', preamp: number, preventClipping: boolean) {
    this.replayGainMode = mode;
    this.replayGainPreamp = preamp;
    this.replayGainPreventClipping = preventClipping;
    this.emitState();
  }

  public setGaplessEnabled(enabled: boolean) {
    this.gaplessEnabled = enabled;
    this.emitState();
  }

  public setCrossfadeDuration(duration: number) {
    this.crossfadeDuration = duration;
    this.emitState();
  }

  public async extractMetadata(filePath: string) {
    const filename = filePath.split('/').pop()?.split('\\').pop() || '';
    const cleanName = filename.replace(/\.[^/.]+$/, "");
    
    let detectedDuration = 0;
    try {
      const audioUri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
      const probePlayer = createAudioPlayer({ uri: audioUri });
      
      detectedDuration = await new Promise<number>((resolve) => {
        let isResolved = false;
        let timeoutId: any = null;
        let sub: any = null;

        const finish = (dur: number) => {
          if (isResolved) return;
          isResolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          try { sub?.remove(); } catch (e) {}
          try { probePlayer.release(); } catch (e) {}
          resolve(dur);
        };

        try {
          sub = probePlayer.addListener('playbackStatusUpdate', (status) => {
            if (status.duration && status.duration > 0) {
              finish(status.duration);
            }
          });
        } catch (e) {
          finish(0);
          return;
        }

        timeoutId = setTimeout(() => {
          finish(0);
        }, 1200);
      });
    } catch (e) {
      console.warn("Could not probe audio duration in JS fallback:", e);
    }

    if (cleanName.includes(' - ')) {
      const parts = cleanName.split(' - ');
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(' - ').trim(),
        album: 'Unknown Album',
        duration: detectedDuration
      };
    }

    return {
      title: cleanName || 'Audio Track',
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      duration: detectedDuration
    };
  }

  public addListener(eventName: string, listener: (state: PlaybackState) => void) {
    this.listeners.add(listener);
    this.emitState();
    return {
      remove: () => {
        this.listeners.delete(listener);
      }
    };
  }

  public removeAllListeners() {
    this.listeners.clear();
  }
}

let SonanceAudioModuleProxy: SonanceAudioModule;

try {
  SonanceAudioModuleProxy = requireNativeModule<SonanceAudioModule>('SonanceAudio');
} catch (e) {
  // Use rich Expo Go fallback
  SonanceAudioModuleProxy = new ExpoGoAudioEngine() as any;
}

export default SonanceAudioModuleProxy;

