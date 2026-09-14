import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radii } from '../../src/theme';
import { getAllTracks, clearAllTracks, getEqualizerSettings, saveEqualizerSettings } from '../../src/data/database';
import { getHapticsEnabled, setHapticsEnabled, triggerLightImpact } from '../../src/utils/haptics';
import { router, useFocusEffect } from 'expo-router';
import { DEFAULT_EQUALIZER_STATE, EqualizerState, VLC_EQUALIZER_PRESETS } from '../../src/data/equalizerPresets';
import { PlayerController } from '../../src/player/PlayerController';

export default function SettingsScreen() {
  const [trackCount, setTrackCount] = useState(0);
  const [losslessAudio, setLosslessAudio] = useState(true);
  const [hapticFeedback, setHapticFeedbackState] = useState(getHapticsEnabled());
  const [equalizer, setEqualizer] = useState<EqualizerState>(DEFAULT_EQUALIZER_STATE);

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
    }, [])
  );

  const applyEqualizer = (next: EqualizerState) => {
    setEqualizer(next);
    saveEqualizerSettings(next);
    PlayerController.setEqualizerBands(next.bands, next.preamp);
    PlayerController.setEqualizerEnabled(next.enabled);
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
        {/* Section: Library Management */}
        <Text style={styles.sectionHeader}>LIBRARY & STORAGE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#3B82F6' }]}>
                <Ionicons name="musical-notes" size={18} color={colors.white} />
              </View>
              <Text style={styles.rowLabel}>Total Songs</Text>
            </View>
            <Text style={styles.rowValue}>{trackCount} tracks</Text>
          </View>
          
          <View style={styles.divider} />

          <TouchableOpacity style={styles.row} onPress={() => router.push('/import')}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#10B981' }]}>
                <Ionicons name="cloud-upload" size={18} color={colors.white} />
              </View>
              <Text style={styles.rowLabel}>Import Music</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.row} onPress={handleClearLibrary}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#EF4444' }]}>
                <Ionicons name="trash" size={18} color={colors.white} />
              </View>
              <Text style={[styles.rowLabel, { color: '#EF4444' }]}>Clear Library</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Section: Audio Engine */}
        <Text style={styles.sectionHeader}>AUDIO ENGINE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#8B5CF6' }]}>
                <Ionicons name="hardware-chip" size={18} color={colors.white} />
              </View>
              <Text style={styles.rowLabel}>Engine Mode</Text>
            </View>
            <Text style={styles.rowValue}>Hybrid Native (AVPlayer)</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#0EA5E9' }]}>
                <Ionicons name="options" size={18} color={colors.white} />
              </View>
              <View>
                <Text style={styles.rowLabel}>10-Band Equalizer</Text>
                <Text style={styles.rowHint}>{equalizer.presetName}</Text>
              </View>
            </View>
            <Switch
              value={equalizer.enabled}
              onValueChange={(enabled) => applyEqualizer({ ...equalizer, enabled })}
              trackColor={{ true: colors.tint, false: '#CBD5E1' }}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetList}
          >
            {VLC_EQUALIZER_PRESETS.map((preset) => {
              const selected = preset.name === equalizer.presetName;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[styles.preset, selected && styles.presetSelected]}
                  onPress={() => applyEqualizer({
                    enabled: true,
                    presetName: preset.name,
                    bands: preset.bands,
                    preamp: preset.preamp,
                  })}
                >
                  <Text style={[styles.presetText, selected && styles.presetTextSelected]}>{preset.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#EC4899' }]}>
                <Ionicons name="sparkles" size={18} color={colors.white} />
              </View>
              <Text style={styles.rowLabel}>Lossless Output</Text>
            </View>
            <Switch 
              value={losslessAudio} 
              onValueChange={setLosslessAudio} 
              trackColor={{ true: colors.tint, false: '#CBD5E1' }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#F59E0B' }]}>
                <Ionicons name="finger-print" size={18} color={colors.white} />
              </View>
              <Text style={styles.rowLabel}>Haptic Feedback</Text>
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
        </View>

        {/* Section: About */}
        <Text style={styles.sectionHeader}>ABOUT</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>App Version</Text>
            <Text style={styles.rowValue}>1.0.0 (Release Candidate)</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Architecture</Text>
            <Text style={styles.rowValue}>Swift + Expo SDK 57</Text>
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
    letterSpacing: -0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    marginBottom: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 160,
  },
  sectionHeader: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  rowLabel: {
    fontSize: typography.sizes.md,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  rowValue: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  rowHint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  presetList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  preset: {
    borderWidth: 1,
    borderColor: '#D8E2EA',
    borderRadius: radii.round,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  presetSelected: {
    backgroundColor: colors.tint,
    borderColor: colors.tint,
  },
  presetText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
  presetTextSelected: {
    color: colors.white,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginLeft: spacing.md + 28 + spacing.md,
  },
});
