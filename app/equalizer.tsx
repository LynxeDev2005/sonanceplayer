import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  PanResponder,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, typography, spacing, radii } from '../src/theme';
import {
  EQUALIZER_FREQUENCIES,
  VLC_EQUALIZER_PRESETS,
  DEFAULT_EQUALIZER_STATE,
  EqualizerPreset,
} from '../src/data/equalizerPresets';
import { getEqualizerSettings, saveEqualizerSettings } from '../src/data/database';
import { PlayerController } from '../src/player/PlayerController';
import { triggerLightImpact, triggerSelection, triggerMediumImpact, triggerSuccess } from '../src/utils/haptics';

export default function EqualizerScreen() {
  const { width } = useWindowDimensions();
  const [enabled, setEnabled] = useState(false);
  const [activePreset, setActivePreset] = useState('Flat');
  const [preamp, setPreamp] = useState(0);
  const [bands, setBands] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  // Load saved equalizer settings on mount
  useEffect(() => {
    const saved = getEqualizerSettings();
    if (saved) {
      setEnabled(saved.enabled);
      setActivePreset(saved.presetName || 'Flat');
      setPreamp(saved.preamp || 0);
      setBands(saved.bands && saved.bands.length === 10 ? saved.bands : DEFAULT_EQUALIZER_STATE.bands);
      PlayerController.setEqualizerEnabled(saved.enabled);
      PlayerController.setEqualizerBands(
        saved.bands && saved.bands.length === 10 ? saved.bands : DEFAULT_EQUALIZER_STATE.bands,
        saved.preamp || 0
      );
    }
  }, []);

  // Sync state to native engine and SQLite
  const applyAndSaveState = (newEnabled: boolean, newBands: number[], newPreamp: number, newPresetName: string) => {
    PlayerController.setEqualizerEnabled(newEnabled);
    PlayerController.setEqualizerBands(newBands, newPreamp);
    saveEqualizerSettings({
      enabled: newEnabled,
      presetName: newPresetName,
      preamp: newPreamp,
      bands: newBands,
    });
  };

  const handleToggleEnabled = (val: boolean) => {
    setEnabled(val);
    triggerMediumImpact();
    applyAndSaveState(val, bands, preamp, activePreset);
  };

  const handleSelectPreset = (preset: EqualizerPreset) => {
    triggerLightImpact();
    setActivePreset(preset.name);
    setBands([...preset.bands]);
    setPreamp(preset.preamp);
    applyAndSaveState(enabled, preset.bands, preset.preamp, preset.name);
  };

  const handleBandChange = (index: number, newGain: number) => {
    const clamped = Math.max(-20, Math.min(20, Math.round(newGain * 10) / 10));
    const newBands = [...bands];
    newBands[index] = clamped;
    setBands(newBands);
    setActivePreset('Custom');
    applyAndSaveState(enabled, newBands, preamp, 'Custom');
  };

  const handlePreampChange = (newPreamp: number) => {
    const clamped = Math.max(-20, Math.min(20, Math.round(newPreamp * 10) / 10));
    setPreamp(clamped);
    setActivePreset('Custom');
    applyAndSaveState(enabled, bands, clamped, 'Custom');
  };

  const handleResetToFlat = () => {
    triggerSuccess();
    const flat = VLC_EQUALIZER_PRESETS[0];
    setActivePreset(flat.name);
    setBands([...flat.bands]);
    setPreamp(flat.preamp);
    applyAndSaveState(enabled, flat.bands, flat.preamp, flat.name);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-down" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleCapsule}>
          <Text style={styles.headerTitle}>10-BAND EQUALIZER</Text>
        </View>
        <TouchableOpacity onPress={handleResetToFlat} style={styles.resetBtn} activeOpacity={0.7}>
          <Text style={styles.resetBtnText}>Flat</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Master Switch Card */}
        <BlurView intensity={90} tint="light" style={styles.masterCard}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.0)']}
            style={styles.specularRim}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <View style={styles.masterRow}>
            <View style={styles.masterLeft}>
              <View style={[styles.masterIconBox, enabled && styles.masterIconBoxActive]}>
                <Ionicons name="options" size={20} color={enabled ? colors.white : colors.textSecondary} />
              </View>
              <View>
                <Text style={styles.masterTitle}>Equalizer Engine</Text>
                <Text style={styles.masterSubtitle}>
                  {enabled ? `Active • ${activePreset}` : 'Bypassed (Bit-Perfect)'}
                </Text>
              </View>
            </View>
            <Switch
              value={enabled}
              onValueChange={handleToggleEnabled}
              trackColor={{ true: colors.tint, false: '#CBD5E1' }}
            />
          </View>
        </BlurView>

        {/* 18 VLC Preset Carousel */}
        <Text style={styles.sectionLabel}>PRESETS</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.presetScroll}
          contentContainerStyle={styles.presetScrollContent}
        >
          {VLC_EQUALIZER_PRESETS.map((preset) => {
            const isSelected = activePreset === preset.name;
            return (
              <TouchableOpacity
                key={preset.id}
                style={[styles.presetChip, isSelected && styles.presetChipActive]}
                onPress={() => handleSelectPreset(preset)}
                activeOpacity={0.75}
              >
                <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>
                  {preset.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* 10-Band Sliders Console Card */}
        <BlurView intensity={90} tint="light" style={styles.consoleCard}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.0)']}
            style={styles.specularRim}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />

          {/* Preamp Section */}
          <View style={styles.preampRow}>
            <View style={styles.preampHeader}>
              <Text style={styles.preampTitle}>PREAMP</Text>
              <Text style={[styles.preampValue, preamp < 0 ? styles.gainNegative : preamp > 0 ? styles.gainPositive : {}]}>
                {preamp > 0 ? `+${preamp.toFixed(1)}` : preamp.toFixed(1)} dB
              </Text>
            </View>
            <PreampSlider value={preamp} onChange={handlePreampChange} enabled={enabled} />
          </View>

          <View style={styles.divider} />

          {/* 10 Vertical Faders */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.fadersContainer}
          >
            {EQUALIZER_FREQUENCIES.map((band, idx) => {
              const gain = bands[idx] ?? 0;
              return (
                <VerticalFader
                  key={band.frequency}
                  label={band.label}
                  value={gain}
                  enabled={enabled}
                  onChange={(val) => handleBandChange(idx, val)}
                />
              );
            })}
          </ScrollView>
        </BlurView>
      </ScrollView>
    </SafeAreaView>
  );
}

// -------------------------------------------------------------
// Vertical Fader Component
// -------------------------------------------------------------
interface VerticalFaderProps {
  label: string;
  value: number; // -20 to +20 dB
  enabled: boolean;
  onChange: (val: number) => void;
}

const FADER_HEIGHT = 160;

function VerticalFader({ label, value, enabled, onChange }: VerticalFaderProps) {
  const trackHeight = FADER_HEIGHT;
  const lastHapticRef = useRef(value);

  // Normalize: +20dB -> ratio 1.0 (top), 0dB -> ratio 0.5 (center), -20dB -> ratio 0.0 (bottom)
  const ratio = (value + 20) / 40;
  const thumbY = trackHeight * (1 - ratio);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        triggerLightImpact();
      },
      onPanResponderMove: (_, gestureState) => {
        const delta = -gestureState.dy / trackHeight;
        const currentRatio = Math.max(0, Math.min(1, ratio + delta));
        const newDb = Math.round((currentRatio * 40 - 20) * 10) / 10;

        // Snap to 0dB center notch with light tactile tick
        const snappedDb = Math.abs(newDb) < 0.6 ? 0 : newDb;

        if (Math.abs(snappedDb - lastHapticRef.current) >= 1.5) {
          triggerSelection();
          lastHapticRef.current = snappedDb;
        }

        onChange(snappedDb);
      },
    })
  ).current;

  return (
    <View style={styles.faderWrapper}>
      {/* dB Value Readout */}
      <Text style={[styles.faderValue, value > 0 ? styles.gainPositive : value < 0 ? styles.gainNegative : {}]}>
        {value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)}
      </Text>

      {/* Vertical Slider Track */}
      <View style={[styles.faderTrack, !enabled && styles.faderTrackDisabled]} {...panResponder.panHandlers}>
        {/* 0dB Center Notch Reference Hairline */}
        <View style={styles.centerNotch} />

        {/* Fill from Center */}
        {value >= 0 ? (
          <View
            style={[
              styles.faderFillPositive,
              {
                bottom: trackHeight / 2,
                height: (value / 20) * (trackHeight / 2),
                backgroundColor: enabled ? colors.tint : '#94A3B8',
              },
            ]}
          />
        ) : (
          <View
            style={[
              styles.faderFillNegative,
              {
                top: trackHeight / 2,
                height: (Math.abs(value) / 20) * (trackHeight / 2),
                backgroundColor: enabled ? '#EF4444' : '#94A3B8',
              },
            ]}
          />
        )}

        {/* Liquid Glass Thumb */}
        <View style={[styles.faderThumb, { top: Math.max(0, Math.min(trackHeight - 16, thumbY - 8)) }]}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.95)', 'rgba(235, 240, 245, 0.85)']}
            style={styles.faderThumbInner}
          >
            <View style={styles.thumbCenterDot} />
          </LinearGradient>
        </View>
      </View>

      {/* Frequency Label */}
      <Text style={styles.faderLabel}>{label}</Text>
    </View>
  );
}

// -------------------------------------------------------------
// Preamp Slider Component
// -------------------------------------------------------------
interface PreampSliderProps {
  value: number;
  enabled: boolean;
  onChange: (val: number) => void;
}

function PreampSlider({ value, enabled, onChange }: PreampSliderProps) {
  const [sliderWidth, setSliderWidth] = useState(240);
  const ratio = (value + 20) / 40;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        triggerLightImpact();
      },
      onPanResponderMove: (_, gestureState) => {
        const deltaRatio = gestureState.dx / (sliderWidth || 1);
        const newRatio = Math.max(0, Math.min(1, ratio + deltaRatio));
        const newDb = Math.round((newRatio * 40 - 20) * 10) / 10;
        const snapped = Math.abs(newDb) < 0.6 ? 0 : newDb;
        onChange(snapped);
      },
    })
  ).current;

  return (
    <View
      style={styles.preampTrack}
      onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
    >
      <View style={styles.preampCenterLine} />
      <View
        style={[
          styles.preampFill,
          {
            left: value >= 0 ? '50%' : `${ratio * 100}%`,
            width: `${Math.abs(value / 40) * 100}%`,
            backgroundColor: enabled ? (value > 0 ? '#10B981' : '#3B82F6') : '#94A3B8',
          },
        ]}
      />
      <View style={[styles.preampThumb, { left: `${ratio * 100}%` }]}>
        <View style={styles.preampThumbInner} />
      </View>
    </View>
  );
}

// -------------------------------------------------------------
// Styles
// -------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleCapsule: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.tint,
    letterSpacing: 0.8,
  },
  resetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  resetBtnText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.tint,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  masterCard: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    padding: spacing.md,
    marginTop: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  specularRim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
  },
  masterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  masterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  masterIconBox: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  masterIconBoxActive: {
    backgroundColor: colors.tint,
  },
  masterTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  masterSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  presetScroll: {
    marginHorizontal: -spacing.lg,
    marginBottom: spacing.md,
  },
  presetScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  presetChipActive: {
    backgroundColor: colors.tint,
    borderColor: colors.tint,
  },
  presetChipText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.text,
  },
  presetChipTextActive: {
    color: colors.white,
    fontWeight: typography.weights.bold,
  },
  consoleCard: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  preampRow: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  preampHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  preampTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  preampValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  preampTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    position: 'relative',
    justifyContent: 'center',
  },
  preampCenterLine: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  preampFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 4,
  },
  preampThumb: {
    position: 'absolute',
    top: -6,
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.tint,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  preampThumbInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.tint,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: spacing.sm,
  },
  fadersContainer: {
    paddingHorizontal: spacing.md,
    gap: 16,
  },
  faderWrapper: {
    alignItems: 'center',
    width: 44,
  },
  faderValue: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  gainPositive: {
    color: colors.tint,
  },
  gainNegative: {
    color: '#EF4444',
  },
  faderTrack: {
    width: 10,
    height: FADER_HEIGHT,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.06)',
    position: 'relative',
    alignItems: 'center',
  },
  faderTrackDisabled: {
    opacity: 0.5,
  },
  centerNotch: {
    position: 'absolute',
    top: FADER_HEIGHT / 2 - 0.75,
    width: 14,
    height: 1.5,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  faderFillPositive: {
    position: 'absolute',
    width: 6,
    borderRadius: 3,
  },
  faderFillNegative: {
    position: 'absolute',
    width: 6,
    borderRadius: 3,
  },
  faderThumb: {
    position: 'absolute',
    width: 32,
    height: 18,
    borderRadius: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  faderThumbInner: {
    width: '100%',
    height: '100%',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbCenterDot: {
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  faderLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
    letterSpacing: -0.2,
  },
});
