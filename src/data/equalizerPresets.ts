export interface EqualizerBand {
  frequency: number;
  label: string;
}

export const EQUALIZER_FREQUENCIES: EqualizerBand[] = [
  { frequency: 32, label: '32Hz' },
  { frequency: 60, label: '60Hz' },
  { frequency: 125, label: '125Hz' },
  { frequency: 250, label: '250Hz' },
  { frequency: 500, label: '500Hz' },
  { frequency: 1000, label: '1kHz' },
  { frequency: 2000, label: '2kHz' },
  { frequency: 4000, label: '4kHz' },
  { frequency: 8000, label: '8kHz' },
  { frequency: 16000, label: '16kHz' },
];

export interface EqualizerPreset {
  id: string;
  name: string;
  bands: number[]; // 10 values in dB (-20.0 to +20.0)
  preamp: number;  // preamp in dB (-20.0 to +20.0)
}

export interface EqualizerState {
  enabled: boolean;
  presetName: string;
  preamp: number;
  bands: number[];
}

export const VLC_EQUALIZER_PRESETS: EqualizerPreset[] = [
  {
    id: 'flat',
    name: 'Flat',
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    preamp: 0,
  },
  {
    id: 'full_bass',
    name: 'Full Bass',
    bands: [7.2, 7.2, 7.2, 4.0, 1.6, -3.2, -6.4, -8.0, -8.8, -8.8],
    preamp: -2.0,
  },
  {
    id: 'full_bass_treble',
    name: 'Bass & Treble',
    bands: [5.6, 4.0, 0, -5.6, -4.0, 1.6, 6.4, 8.8, 9.6, 9.6],
    preamp: -2.0,
  },
  {
    id: 'full_treble',
    name: 'Full Treble',
    bands: [-7.2, -7.2, -7.2, -3.2, 1.6, 8.0, 11.2, 12.0, 12.0, 12.8],
    preamp: -3.0,
  },
  {
    id: 'rock',
    name: 'Rock',
    bands: [6.4, 4.0, -4.0, -6.4, -2.4, 3.2, 6.4, 8.8, 8.8, 8.8],
    preamp: -1.5,
  },
  {
    id: 'pop',
    name: 'Pop',
    bands: [-1.6, 1.6, 5.6, 6.4, 4.0, -1.6, -2.4, -2.4, -1.6, -1.6],
    preamp: 0,
  },
  {
    id: 'techno',
    name: 'Techno',
    bands: [6.4, 4.8, 0, -4.0, -3.2, 0, 6.4, 7.2, 7.2, 6.4],
    preamp: -1.5,
  },
  {
    id: 'dance',
    name: 'Dance',
    bands: [7.2, 5.6, 1.6, 0, 0, -3.2, -4.8, -4.8, 0, 0],
    preamp: -1.0,
  },
  {
    id: 'club',
    name: 'Club',
    bands: [0, 0, 1.6, 3.2, 3.2, 3.2, 1.6, 0, 0, 0],
    preamp: 0,
  },
  {
    id: 'vocal_booster',
    name: 'Vocal Booster',
    bands: [-1.6, -3.2, -3.2, 1.6, 6.4, 6.4, 4.8, 2.4, 0, -1.6],
    preamp: 0,
  },
  {
    id: 'classical',
    name: 'Classical',
    bands: [0, 0, 0, 0, 0, 0, -5.6, -5.6, -5.6, -7.2],
    preamp: 0,
  },
  {
    id: 'headphones',
    name: 'Headphones',
    bands: [3.2, 8.8, 4.0, -2.4, -1.6, 1.6, 4.0, 7.2, 9.6, 10.4],
    preamp: -2.0,
  },
  {
    id: 'live',
    name: 'Live',
    bands: [-3.2, 0, 3.2, 4.0, 4.8, 4.8, 3.2, 1.6, 1.6, 1.6],
    preamp: 0,
  },
  {
    id: 'party',
    name: 'Party',
    bands: [5.6, 5.6, 0, 0, 0, 0, 0, 0, 5.6, 5.6],
    preamp: -1.0,
  },
  {
    id: 'reggae',
    name: 'Reggae',
    bands: [0, 0, -0.8, -4.8, 0, 4.8, 4.8, 2.4, 0, 0],
    preamp: 0,
  },
  {
    id: 'ska',
    name: 'Ska',
    bands: [-1.6, -3.2, -3.2, -0.8, 3.2, 4.8, 7.2, 8.0, 8.8, 7.2],
    preamp: -1.0,
  },
  {
    id: 'soft',
    name: 'Soft',
    bands: [3.2, 1.6, 0, -1.6, 0, 3.2, 6.4, 7.2, 8.0, 8.8],
    preamp: -1.0,
  },
  {
    id: 'soft_rock',
    name: 'Soft Rock',
    bands: [3.2, 3.2, 1.6, 0, -3.2, -4.0, -2.4, 0, 2.4, 6.4],
    preamp: 0,
  },
];

export const DEFAULT_EQUALIZER_STATE: EqualizerState = {
  enabled: false,
  presetName: 'Flat',
  preamp: 0,
  bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
