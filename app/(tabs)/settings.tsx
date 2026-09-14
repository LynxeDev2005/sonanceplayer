import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radii } from '../../src/theme';
import { 
  getAllTracks, 
  clearAllTracks, 
  getEqualizerSettings, 
  saveEqualizerSettings, 
  getAudioEngineSettings, 
  saveAudioEngineSettings,
  getVisualSettings,
  saveVisualSettings
} from '../../src/data/database';
import { getHapticsEnabled, setHapticsEnabled, triggerLightImpact, triggerSelection, triggerSuccess, triggerError } from '../../src/utils/haptics';
import { router, useFocusEffect } from 'expo-router';
import { DEFAULT_EQUALIZER_STATE, EqualizerState } from '../../src/data/equalizerPresets';
import { PlayerController } from '../../src/player/PlayerController';
import * as Updates from 'expo-updates';

export default function SettingsScreen() {
  const [trackCount, setTrackCount] = useState(0);
  const [losslessAudio, setLosslessAudio] = useState(true);
  const [hapticFeedback, setHapticFeedbackState] = useState(getHapticsEnabled());
  const [equalizer, setEqualizer] = useState<EqualizerState>(DEFAULT_EQUALIZER_STATE);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  // Playback & ReplayGain Settings
  const [replayGainMode, setReplayGainMode] = useState<'off' | 'track' | 'album'>('off');
  const [replayGainPreamp, setReplayGainPreamp] = useState(0.0);
  const [replayGainPreventClipping, setReplayGainPreventClipping] = useState(true);
  const [gaplessEnabled, setGaplessEnabledState] = useState(true);
  const [crossfadeDuration, setCrossfadeDurationState] = useState(0.0);
  
  // Ambient Visual Waves Settings
  const [milkyRipplesMode, setMilkyRipplesMode] = useState<'off' | 'subtle' | 'expressive'>('expressive');

  useFocusEffect(
    React.useCallback(() => {
      setTrackCount(getAllTracks().length);
      setHapticFeedbackState(getHapticsEnabled());
      
      const savedEqualizer = getEqualizerSettings();
      if (savedEqualizer) {
        setEqualizer(savedEqualizer);
        PlayerController.setEqualizerBands(savedEqualizer.bands, savedEqualizer.preamp);
        PlayerController.setEqualizerEnabled(savedEqualizer.enabled);
      }

      const audioSettings = getAudioEngineSettings();
      if (audioSettings) {
        setReplayGainMode(audioSettings.replayGainMode);
        setReplayGainPreamp(audioSettings.replayGainPreamp);
        setReplayGainPreventClipping(audioSettings.replayGainPreventClipping);
        setGaplessEnabledState(audioSettings.gaplessEnabled);
        setCrossfadeDurationState(audioSettings.crossfadeDuration);
      }

      const visual = getVisualSettings();
      if (visual) {
        setMilkyRipplesMode(visual.milkyRipples);
      }
    }, [])
  );

  const handleCheckForUpdates = async () => {
    if (__DEV__) {
      Alert.alert("Development Mode", "Over-the-air updates are active on production builds.");
      return;
    }
    setIsCheckingUpdate(true);
    triggerLightImpact();
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert(
          "Update Available",
          "A new over-the-air update is available. Download and reload now?",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Update Now",
              onPress: async () => {
                try {
                  await Updates.fetchUpdateAsync();
                  triggerSuccess();
                  await Updates.reloadAsync();
                } catch (e: any) {
                  Alert.alert("Update Error", e.message || "Failed to download update.");
                }
              }
            }
          ]
        );
      } else {
        triggerSuccess();
        Alert.alert("Up to Date", "You are already using the latest version of Sonance.");
      }
    } catch (e: any) {
      triggerError();
      Alert.alert("Update Check Failed", e.message || "Unable to reach update server.");
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const toggleEqualizer = (enabled: boolean) => {
    triggerLightImpact();
    const updated = { ...equalizer, enabled };
    setEqualizer(updated);
    saveEqualizerSettings(updated);
    PlayerController.setEqualizerEnabled(enabled);
  };

  const applyReplayGainMode = (mode: 'off' | 'track' | 'album') => {
    triggerSelection();
    setReplayGainMode(mode);
    PlayerController.setReplayGain(mode, replayGainPreamp, replayGainPreventClipping);
  };

  const adjustReplayGainPreamp = (delta: number) => {
    triggerLightImpact();
    const nextVal = Math.round((replayGainPreamp + delta) * 2) / 2;
    const clamped = Math.max(-6.0, Math.min(6.0, nextVal));
    setReplayGainPreamp(clamped);
    PlayerController.setReplayGain(replayGainMode, clamped, replayGainPreventClipping);
  };

  const togglePreventClipping = (enabled: boolean) => {
    triggerLightImpact();
    setReplayGainPreventClipping(enabled);
    PlayerController.setReplayGain(replayGainMode, replayGainPreamp, enabled);
  };

  const toggleGapless = (enabled: boolean) => {
    triggerLightImpact();
    setGaplessEnabledState(enabled);
    PlayerController.setGaplessEnabled(enabled);
  };

  const adjustCrossfade = (delta: number) => {
    triggerLightImpact();
    const nextVal = Math.round((crossfadeDuration + delta) * 2) / 2;
    const clamped = Math.max(0, Math.min(12, nextVal));
    setCrossfadeDurationState(clamped);
    PlayerController.setCrossfadeDuration(clamped);
  };

  const applyMilkyRipplesMode = (mode: 'off' | 'subtle' | 'expressive') => {
    triggerSelection();
    setMilkyRipplesMode(mode);
    saveVisualSettings({ milkyRipples: mode });
  };

  const handleClearLibrary = () => {
    Alert.alert(
      "Clear Music Library",
      "Are you sure you want to remove all imported songs and playlists? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Clear All", 
          style: "destructive", 
          onPress: () => {
            clearAllTracks();
            setTrackCount(0);
            Alert.alert("Success", "Library has been cleared.");
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.largeTitle}>Settings</Text>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* ===================== CARD 1: AUDIO ENGINE & DSP ===================== */}
        <Text style={styles.sectionHeader}>AUDIO ENGINE & DSP</Text>
        <View style={styles.card}>
          
          {/* Equalizer Navigation Row */}
          <TouchableOpacity 
            style={styles.row} 
            onPress={() => router.push('/equalizer')} 
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#6366F1' }]}>
                <Ionicons name="options" size={17} color={colors.white} />
              </View>
              <View style={styles.rowTextContainer}>
                <Text style={styles.rowLabel}>10-Band Equalizer</Text>
                <Text style={styles.rowHint}>
                  {equalizer.enabled ? `${equalizer.presetName} (Active)` : 'Bypassed'}
                </Text>
              </View>
            </View>
            <View style={styles.rowRightControls}>
              <Switch
                value={equalizer.enabled}
                onValueChange={toggleEqualizer}
                trackColor={{ true: colors.tint, false: '#CBD5E1' }}
              />
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" style={{ marginLeft: 8 }} />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Gapless Playback */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#059669' }]}>
                <Ionicons name="infinite" size={18} color={colors.white} />
              </View>
              <View style={styles.rowTextContainer}>
                <Text style={styles.rowLabel}>Gapless Playback</Text>
                <Text style={styles.rowHint}>0ms instant album track transitions</Text>
              </View>
            </View>
            <Switch 
              value={gaplessEnabled} 
              onValueChange={toggleGapless} 
              trackColor={{ true: colors.tint, false: '#CBD5E1' }}
            />
          </View>

          <View style={styles.divider} />

          {/* Equal-Power Crossfade */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#8B5CF6' }]}>
                <Ionicons name="git-compare" size={17} color={colors.white} />
              </View>
              <View style={styles.rowTextContainer}>
                <Text style={styles.rowLabel}>Equal-Power Crossfade</Text>
                <Text style={styles.rowHint}>
                  {crossfadeDuration === 0 ? 'Disabled (Instant 0ms gapless)' : `${crossfadeDuration.toFixed(1)}s equal-power blend`}
                </Text>
              </View>
            </View>
            <View style={styles.stepperContainer}>
              <TouchableOpacity 
                style={[styles.stepBtn, crossfadeDuration <= 0 && styles.stepBtnDisabled]} 
                onPress={() => adjustCrossfade(-0.5)}
                disabled={crossfadeDuration <= 0}
                activeOpacity={0.6}
              >
                <Ionicons name="remove" size={15} color={crossfadeDuration <= 0 ? '#CBD5E1' : '#0F172A'} />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>
                {crossfadeDuration === 0 ? 'Off' : `${crossfadeDuration.toFixed(1)}s`}
              </Text>
              <TouchableOpacity 
                style={[styles.stepBtn, crossfadeDuration >= 12 && styles.stepBtnDisabled]} 
                onPress={() => adjustCrossfade(0.5)}
                disabled={crossfadeDuration >= 12}
                activeOpacity={0.6}
              >
                <Ionicons name="add" size={15} color={crossfadeDuration >= 12 ? '#CBD5E1' : '#0F172A'} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Lossless Audio Output */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#EC4899' }]}>
                <Ionicons name="sparkles" size={17} color={colors.white} />
              </View>
              <View style={styles.rowTextContainer}>
                <Text style={styles.rowLabel}>Lossless Pipeline</Text>
                <Text style={styles.rowHint}>Direct 32-bit floating point audio bus</Text>
              </View>
            </View>
            <Switch 
              value={losslessAudio} 
              onValueChange={setLosslessAudio} 
              trackColor={{ true: colors.tint, false: '#CBD5E1' }}
            />
          </View>
        </View>

        {/* ===================== CARD 2: LOUDNESS NORMALIZATION ===================== */}
        <Text style={styles.sectionHeader}>LOUDNESS NORMALIZATION (REPLAYGAIN)</Text>
        <View style={styles.card}>
          
          {/* ReplayGain Section Header Row */}
          <View style={[styles.row, { paddingBottom: 6 }]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#0D9488' }]}>
                <Ionicons name="volume-medium" size={18} color={colors.white} />
              </View>
              <View style={styles.rowTextContainer}>
                <Text style={styles.rowLabel}>Loudness Leveling</Text>
                <Text style={styles.rowHint}>ITU-R BS.1770 / EBU R128 standard</Text>
              </View>
            </View>
          </View>

          {/* Sleek Segmented 3-Way Selector */}
          <View style={styles.segmentedContainer}>
            {(['off', 'track', 'album'] as const).map((mode) => {
              const active = replayGainMode === mode;
              const label = mode === 'off' ? 'Off' : mode === 'track' ? 'Track Gain' : 'Album Gain';
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.segmentedPill, active && styles.segmentedPillActive]}
                  onPress={() => applyReplayGainMode(mode)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.segmentedText, active && styles.segmentedTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Extra ReplayGain Controls when Active */}
          {replayGainMode !== 'off' && (
            <>
              <View style={styles.divider} />

              {/* Preamp Stepper */}
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <View style={[styles.iconBox, { backgroundColor: '#2563EB' }]}>
                    <Ionicons name="speedometer" size={17} color={colors.white} />
                  </View>
                  <View style={styles.rowTextContainer}>
                    <Text style={styles.rowLabel}>Target Preamp</Text>
                    <Text style={styles.rowHint}>Reference offset (-6 dB to +6 dB)</Text>
                  </View>
                </View>
                <View style={styles.stepperContainer}>
                  <TouchableOpacity 
                    style={[styles.stepBtn, replayGainPreamp <= -6 && styles.stepBtnDisabled]} 
                    onPress={() => adjustReplayGainPreamp(-0.5)}
                    disabled={replayGainPreamp <= -6}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="remove" size={15} color={replayGainPreamp <= -6 ? '#CBD5E1' : '#0F172A'} />
                  </TouchableOpacity>
                  <Text style={styles.stepperValue}>
                    {replayGainPreamp > 0 ? `+${replayGainPreamp.toFixed(1)} dB` : `${replayGainPreamp.toFixed(1)} dB`}
                  </Text>
                  <TouchableOpacity 
                    style={[styles.stepBtn, replayGainPreamp >= 6 && styles.stepBtnDisabled]} 
                    onPress={() => adjustReplayGainPreamp(0.5)}
                    disabled={replayGainPreamp >= 6}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="add" size={15} color={replayGainPreamp >= 6 ? '#CBD5E1' : '#0F172A'} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Anti-Clipping Limiter */}
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <View style={[styles.iconBox, { backgroundColor: '#F59E0B' }]}>
                    <Ionicons name="shield-checkmark" size={17} color={colors.white} />
                  </View>
                  <View style={styles.rowTextContainer}>
                    <Text style={styles.rowLabel}>Anti-Clipping Guard</Text>
                    <Text style={styles.rowHint}>Prevents distortion on peak dynamics</Text>
                  </View>
                </View>
                <Switch 
                  value={replayGainPreventClipping} 
                  onValueChange={togglePreventClipping} 
                  trackColor={{ true: colors.tint, false: '#CBD5E1' }}
                />
              </View>
            </>
          )}
        </View>

        {/* ===================== CARD: AMBIENT VISUALS & LIQUID WAVES ===================== */}
        <Text style={styles.sectionHeader}>AMBIENT VISUALS & LIQUID WAVES</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#38BDF8' }]}>
                <Ionicons name="water" size={17} color={colors.white} />
              </View>
              <View style={styles.rowTextContainer}>
                <Text style={styles.rowLabel}>Milky Liquid Ripples</Text>
                <Text style={styles.rowHint}>Circular water wave propagation from music</Text>
              </View>
            </View>
          </View>

          <View style={styles.segmentedContainer}>
            {(['off', 'subtle', 'expressive'] as const).map((mode) => {
              const active = milkyRipplesMode === mode;
              const label = mode === 'off' ? 'Off' : mode === 'subtle' ? 'Subtle' : 'Expressive';
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.segmentedPill, active && styles.segmentedPillActive]}
                  onPress={() => applyMilkyRipplesMode(mode)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.segmentedText, active && styles.segmentedTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ===================== CARD 3: LIBRARY & PREFERENCES ===================== */}
        <Text style={styles.sectionHeader}>LIBRARY & PREFERENCES</Text>
        <View style={styles.card}>
          
          {/* Total Songs */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#3B82F6' }]}>
                <Ionicons name="musical-notes" size={17} color={colors.white} />
              </View>
              <Text style={styles.rowLabel}>Total Songs</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{trackCount} tracks</Text>
            </View>
          </View>
          
          <View style={styles.divider} />

          {/* Import Music */}
          <TouchableOpacity 
            style={styles.row} 
            onPress={() => router.push('/import')}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#10B981' }]}>
                <Ionicons name="cloud-upload" size={17} color={colors.white} />
              </View>
              <View style={styles.rowTextContainer}>
                <Text style={styles.rowLabel}>Import Music</Text>
                <Text style={styles.rowHint}>Files, iCloud Drive, or WiFi Transfer</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Haptic Feedback */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#F97316' }]}>
                <Ionicons name="finger-print" size={17} color={colors.white} />
              </View>
              <View style={styles.rowTextContainer}>
                <Text style={styles.rowLabel}>Haptic Feedback</Text>
                <Text style={styles.rowHint}>Tactile response on playback controls</Text>
              </View>
            </View>
            <Switch 
              value={hapticFeedback} 
              onValueChange={(val) => {
                setHapticFeedbackState(val);
                setHapticsEnabled(val);
                if (val) triggerLightImpact();
              }} 
              trackColor={{ true: colors.tint, false: '#CBD5E1' }}
            />
          </View>

          <View style={styles.divider} />

          {/* Clear Library */}
          <TouchableOpacity 
            style={styles.row} 
            onPress={handleClearLibrary}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="trash" size={17} color="#EF4444" />
              </View>
              <Text style={[styles.rowLabel, { color: '#EF4444' }]}>Clear Music Library</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ===================== CARD 4: UPDATES & ABOUT ===================== */}
        <Text style={styles.sectionHeader}>UPDATES & ABOUT</Text>
        <View style={styles.card}>
          
          {/* OTA Updates */}
          <TouchableOpacity 
            style={styles.row} 
            onPress={handleCheckForUpdates} 
            disabled={isCheckingUpdate}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#0284C7' }]}>
                <Ionicons name="cloud-download" size={17} color={colors.white} />
              </View>
              <View style={styles.rowTextContainer}>
                <Text style={styles.rowLabel}>Check for Updates</Text>
                <Text style={styles.rowHint}>
                  {isCheckingUpdate ? "Checking server..." : `OTA ID: ${Updates.updateId ? Updates.updateId.slice(0, 8) : 'Latest (Local)'}`}
                </Text>
              </View>
            </View>
            {isCheckingUpdate ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <Ionicons name="refresh" size={18} color={colors.tint} />
            )}
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* App Branding & Specs */}
          <View style={styles.aboutContainer}>
            <Image 
              source={require('../../assets/sonance-logo-black.png')} 
              style={styles.aboutLogo} 
            />
            <Text style={styles.aboutTagline}>Audiophile Music Player</Text>

            <View style={styles.aboutSpecs}>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Version</Text>
                <Text style={styles.specValue}>1.0.0</Text>
              </View>
              <View style={styles.specDivider} />
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Channel</Text>
                <Text style={styles.specValue}>{Updates.channel || 'master'}</Text>
              </View>
              <View style={styles.specDivider} />
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Engine</Text>
                <Text style={styles.specValue}>Swift Dual-Node</Text>
              </View>
            </View>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  largeTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 160,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 18,
    marginLeft: 12,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 2,
    marginBottom: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  rowHint: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1.5,
    fontWeight: '400',
  },
  rowRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.round,
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginHorizontal: 14,
    marginTop: 2,
    marginBottom: 10,
  },
  segmentedPill: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentedPillActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentedText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
  },
  segmentedTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: radii.round,
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1.5,
    elevation: 1,
  },
  stepBtnDisabled: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  stepperValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    paddingHorizontal: 8,
    minWidth: 58,
    textAlign: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginLeft: 58,
  },
  aboutContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  aboutLogo: {
    width: 140,
    height: 32,
    resizeMode: 'contain',
    marginBottom: 4,
  },
  aboutTagline: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  aboutSpecs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  specItem: {
    alignItems: 'center',
    flex: 1,
  },
  specLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  specValue: {
    fontSize: 12.5,
    color: '#1E293B',
    fontWeight: '700',
  },
  specDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
});


