import { AppState, AppStateStatus } from 'react-native';
import * as NativeAudio from '../../modules/sonance-audio/src';
import { 
  logPlayback, 
  loadPlaybackSession, 
  savePlaybackSession, 
  getAudioEngineSettings, 
  saveAudioEngineSettings,
  AudioEngineSettings,
  onDatabaseTrackDeleted
} from '../data/database';

export type { TrackInfo, PlaybackState } from '../../modules/sonance-audio/src';

class PlayerControllerClass {
  private listeners: Set<(state: NativeAudio.PlaybackState) => void> = new Set();
  private currentState: NativeAudio.PlaybackState = {
    isPlaying: false,
    currentIndex: -1,
    shuffle: false,
    repeatMode: 'off',
    position: 0,
    duration: 0,
  };

  private queue: NativeAudio.TrackInfo[] = [];
  private lastPersistTime: number = 0;
  private isInitialized: boolean = false;

  constructor() {
    // 1. Listen to Native Audio Events
    NativeAudio.addPlaybackListener((state) => {
      // Log playback when track changes
      if (
        state.currentTrack?.id && 
        state.currentTrack.id !== this.currentState.currentTrack?.id
      ) {
        try {
          logPlayback(state.currentTrack.id);
        } catch (e) {
          console.warn("Failed to log playback to history:", e);
        }
      }

      this.currentState = state;
      this.listeners.forEach((l) => l(state));

      // Throttled auto-save playback session during playback (every 5 seconds)
      const now = Date.now();
      if (now - this.lastPersistTime > 5000 && this.queue.length > 0) {
        this.lastPersistTime = now;
        this.persistSession();
      }
    });

    // 2. Persist session when App goes to background
    AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        this.persistSession();
      }
    });

    // 3. Listen to track deletions from database to auto-heal queue
    onDatabaseTrackDeleted((deletedTrackId) => {
      if (deletedTrackId) {
        this.handleTrackDeleted(deletedTrackId);
      } else {
        this.stop();
      }
    });

    // 4. Restore Audio Engine Settings and Previous Playback Session
    this.restoreSessionAndSettings();
  }

  private restoreSessionAndSettings() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      // Restore Audio Engine Settings
      const settings = getAudioEngineSettings();
      if (settings) {
        NativeAudio.setReplayGain(
          settings.replayGainMode,
          settings.replayGainPreamp,
          settings.replayGainPreventClipping
        );
        NativeAudio.setGaplessEnabled(settings.gaplessEnabled);
        NativeAudio.setCrossfadeDuration(settings.crossfadeDuration);
      }

      // Restore Playback Session
      const session = loadPlaybackSession();
      if (session && session.queue && session.queue.length > 0) {
        this.queue = session.queue;
        const validIndex = Math.min(Math.max(0, session.currentIndex), session.queue.length - 1);
        const currentTrack = session.queue[validIndex];
        
        this.currentState = {
          ...this.currentState,
          currentIndex: validIndex,
          position: session.position || 0,
          duration: (currentTrack && currentTrack.duration) ? currentTrack.duration : 0,
          currentTrack,
        };

        // Prepare native engine with restored queue without auto-playing
        try {
          NativeAudio.setQueue(session.queue, validIndex);
          if (session.position > 0) {
            NativeAudio.seek(session.position);
          }
          NativeAudio.pause();
        } catch (nativeErr) {
          console.warn("Could not pre-load restored session into native audio:", nativeErr);
        }
      }
    } catch (e) {
      console.warn("Error restoring session and settings:", e);
    }
  }

  public persistSession() {
    if (this.queue.length === 0) return;
    try {
      savePlaybackSession({
        queue: this.queue,
        currentIndex: this.currentState.currentIndex >= 0 ? this.currentState.currentIndex : 0,
        position: this.currentState.position || 0,
      });
    } catch (e) {
      console.warn("Failed to persist playback session:", e);
    }
  }

  public getState() {
    return this.currentState;
  }

  public getQueue() {
    return this.queue;
  }

  public subscribe(listener: (state: NativeAudio.PlaybackState) => void) {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public play() {
    this.currentState = { ...this.currentState, isPlaying: true };
    this.listeners.forEach((l) => l(this.currentState));
    NativeAudio.play();
    this.persistSession();
  }

  public pause() {
    this.currentState = { ...this.currentState, isPlaying: false };
    this.listeners.forEach((l) => l(this.currentState));
    NativeAudio.pause();
    this.persistSession();
  }

  public stop() {
    this.queue = [];
    this.currentState = {
      isPlaying: false,
      currentIndex: -1,
      shuffle: false,
      repeatMode: this.currentState.repeatMode,
      position: 0,
      duration: 0,
      currentTrack: undefined,
    };
    this.listeners.forEach((l) => l(this.currentState));
    try {
      NativeAudio.stop();
    } catch (e) {
      console.warn("NativeAudio.stop error:", e);
    }
    savePlaybackSession({
      queue: [],
      currentIndex: -1,
      position: 0,
    });
  }

  public handleTrackDeleted(deletedTrackId: string) {
    if (!deletedTrackId) return;

    // Check if the deleted track exists in our active queue
    const trackIndexInQueue = this.queue.findIndex((t) => t.id === deletedTrackId);
    if (trackIndexInQueue === -1) return;

    // If the queue only had this track, stop playback completely and clear
    if (this.queue.length <= 1) {
      this.stop();
      return;
    }

    const wasPlayingCurrent = this.currentState.currentIndex === trackIndexInQueue;
    const nextQueue = this.queue.filter((t) => t.id !== deletedTrackId);

    if (wasPlayingCurrent) {
      // Advance to the next track (or wrap to 0)
      const newIndex = trackIndexInQueue < nextQueue.length ? trackIndexInQueue : 0;
      this.setQueue(nextQueue, newIndex);
    } else {
      // Adjust currentIndex if a preceding track was removed
      let newIndex = this.currentState.currentIndex;
      if (trackIndexInQueue < this.currentState.currentIndex) {
        newIndex = Math.max(0, this.currentState.currentIndex - 1);
      }
      this.queue = nextQueue;
      const currentTrack = nextQueue[newIndex];
      this.currentState = {
        ...this.currentState,
        currentIndex: newIndex,
        currentTrack,
        duration: (currentTrack && currentTrack.duration) ? currentTrack.duration : this.currentState.duration,
      };
      this.listeners.forEach((l) => l(this.currentState));
      this.persistSession();
      try {
        NativeAudio.setQueue(nextQueue, newIndex);
      } catch (e) {}
    }
  }

  public togglePlayPause() {
    if (this.currentState.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public next() {
    NativeAudio.next();
    this.persistSession();
  }

  public previous() {
    NativeAudio.previous();
    this.persistSession();
  }

  public seek(seconds: number) {
    NativeAudio.seek(seconds);
    this.persistSession();
  }

  public setShuffle(enabled: boolean) {
    NativeAudio.setShuffle(enabled);
  }

  public toggleShuffle() {
    this.setShuffle(!this.currentState.shuffle);
  }

  public setRepeatMode(mode: 'off' | 'track' | 'queue') {
    NativeAudio.setRepeatMode(mode);
  }

  public setEqualizerEnabled(enabled: boolean) {
    NativeAudio.setEqualizerEnabled(enabled);
  }

  public setEqualizerBands(gains: number[], preamp: number) {
    NativeAudio.setEqualizerBands(gains, preamp);
  }

  public setReplayGain(mode: 'off' | 'track' | 'album', preamp: number, preventClipping: boolean) {
    NativeAudio.setReplayGain(mode, preamp, preventClipping);
    try {
      const current = getAudioEngineSettings();
      saveAudioEngineSettings({
        replayGainMode: mode,
        replayGainPreamp: preamp,
        replayGainPreventClipping: preventClipping,
        gaplessEnabled: current ? current.gaplessEnabled : true,
        crossfadeDuration: current ? current.crossfadeDuration : 0,
      });
    } catch (e) {
      console.warn("Failed to save ReplayGain settings:", e);
    }
  }

  public setGaplessEnabled(enabled: boolean) {
    NativeAudio.setGaplessEnabled(enabled);
    try {
      const current = getAudioEngineSettings();
      saveAudioEngineSettings({
        replayGainMode: current ? current.replayGainMode : 'off',
        replayGainPreamp: current ? current.replayGainPreamp : 0,
        replayGainPreventClipping: current ? current.replayGainPreventClipping : true,
        gaplessEnabled: enabled,
        crossfadeDuration: current ? current.crossfadeDuration : 0,
      });
    } catch (e) {
      console.warn("Failed to save Gapless settings:", e);
    }
  }

  public setCrossfadeDuration(seconds: number) {
    NativeAudio.setCrossfadeDuration(seconds);
    try {
      const current = getAudioEngineSettings();
      saveAudioEngineSettings({
        replayGainMode: current ? current.replayGainMode : 'off',
        replayGainPreamp: current ? current.replayGainPreamp : 0,
        replayGainPreventClipping: current ? current.replayGainPreventClipping : true,
        gaplessEnabled: current ? current.gaplessEnabled : true,
        crossfadeDuration: seconds,
      });
    } catch (e) {
      console.warn("Failed to save Crossfade settings:", e);
    }
  }

  public toggleRepeatMode() {
    const modes: ('off' | 'track' | 'queue')[] = ['off', 'queue', 'track'];
    const currentIndex = modes.indexOf(this.currentState.repeatMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    this.setRepeatMode(nextMode);
  }

  public loadTrack(track: NativeAudio.TrackInfo) {
    this.queue = [track];
    NativeAudio.loadTrack(track);
    this.play();
    this.persistSession();
  }

  public setQueue(tracks: NativeAudio.TrackInfo[], startIndex: number = 0) {
    this.queue = tracks;
    NativeAudio.setQueue(tracks, startIndex);
    this.play();
    this.persistSession();
  }

  public playNext(track: NativeAudio.TrackInfo) {
    if (this.currentState.currentIndex >= 0 && this.currentState.currentIndex < this.queue.length) {
      this.queue.splice(this.currentState.currentIndex + 1, 0, track);
    } else {
      this.queue.push(track);
    }
    NativeAudio.playNext(track);
    this.persistSession();
  }

  public addToQueue(track: NativeAudio.TrackInfo) {
    this.queue.push(track);
    NativeAudio.addToQueue(track);
    this.persistSession();
  }
}

export const PlayerController = new PlayerControllerClass();

