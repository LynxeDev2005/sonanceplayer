import { useState, useEffect } from 'react';
import { PlayerController } from './PlayerController';
import type { PlaybackState } from './PlayerController';

export function usePlaybackState(): PlaybackState {
  const [state, setState] = useState<PlaybackState>(PlayerController.getState());

  useEffect(() => {
    const unsubscribe = PlayerController.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  return state;
}
