import * as NativeAudio from '../../modules/sonance-audio/src';
import { logPlayback } from '../data/database';

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

  constructor() {
    NativeAudio.addPlaybackListener((state) => {
      // If the current track changed, log it to history
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
    });
  }

  public getState() {
    return this.currentState;
  }

  public getQueue() {
    return this.queue;
  }

  public subscribe(listener: (state: NativeAudio.PlaybackState) => void) {
    this.listeners.add(listener);
    listener(this.currentState); // Send initial state immediately
    return () => {
      this.listeners.delete(listener);
    };
  }

  public play() {
    this.currentState = { ...this.currentState, isPlaying: true };
    this.listeners.forEach((l) => l(this.currentState));
    NativeAudio.play();
  }

  public pause() {
    this.currentState = { ...this.currentState, isPlaying: false };
    this.listeners.forEach((l) => l(this.currentState));
    NativeAudio.pause();
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
  }

  public previous() {
    NativeAudio.previous();
  }

  public seek(seconds: number) {
    NativeAudio.seek(seconds);
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

  public toggleRepeatMode() {
    const modes: ('off' | 'track' | 'queue')[] = ['off', 'queue', 'track'];
    const currentIndex = modes.indexOf(this.currentState.repeatMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    this.setRepeatMode(nextMode);
  }

  public loadTrack(track: NativeAudio.TrackInfo) {
    NativeAudio.loadTrack(track);
  }

  public setQueue(tracks: NativeAudio.TrackInfo[], startIndex: number = 0) {
    this.queue = tracks;
    NativeAudio.setQueue(tracks, startIndex);
  }

  public playNext(track: NativeAudio.TrackInfo) {
    if (this.currentState.currentIndex >= 0 && this.currentState.currentIndex < this.queue.length) {
      this.queue.splice(this.currentState.currentIndex + 1, 0, track);
    } else {
      this.queue.push(track);
    }
    NativeAudio.playNext(track);
  }

  public addToQueue(track: NativeAudio.TrackInfo) {
    this.queue.push(track);
    NativeAudio.addToQueue(track);
  }
}

export const PlayerController = new PlayerControllerClass();
