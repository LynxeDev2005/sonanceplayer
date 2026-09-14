import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Image } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme';
import { router } from 'expo-router';
import { usePlaybackState } from '../player/hooks';
import { PlayerController } from '../player/PlayerController';
import { triggerLightImpact } from '../utils/haptics';

export function MiniPlayer() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { currentTrack, isPlaying, position, duration } = usePlaybackState();

  if (!currentTrack) {
    return null;
  }

  const progress = (position ?? 0) / (duration ?? 1);
  const bottomPosition = Math.max(insets.bottom, 12) + 70;

  return (
    <TouchableOpacity 
      style={[styles.container, { bottom: bottomPosition, width: width - 32 }]}
      activeOpacity={0.9}
      onPress={() => router.push('/player')}
    >
      <BlurView intensity={95} tint="light" style={styles.blurCard}>
        {/* Specular Top Rim Highlight */}
        <LinearGradient 
          colors={['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.0)']} 
          style={styles.specularSheen}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
        <View style={styles.content}>
          {/* Artwork Glass Capsule */}
          <View style={styles.artworkWrapper}>
            {currentTrack.artworkUrl ? (
              <Image source={{ uri: currentTrack.artworkUrl }} style={styles.artwork} />
            ) : (
              <LinearGradient colors={['#E2E8F0', '#CBD5E1']} style={styles.artworkPlaceholder}>
                <Ionicons name="musical-note" size={18} color={colors.textSecondary} />
              </LinearGradient>
            )}
          </View>
          
          {/* Track Info */}
          <View style={styles.infoContainer}>
            <Text style={styles.title} numberOfLines={1}>{currentTrack.title}</Text>
            <Text style={styles.artist} numberOfLines={1}>{currentTrack.artist}</Text>
          </View>
          
          {/* Liquid Glass Play Button */}
          <TouchableOpacity 
            style={styles.playButton} 
            activeOpacity={0.7}
            onPress={(e) => {
              e.stopPropagation();
              triggerLightImpact();
              PlayerController.togglePlayPause();
            }}
          >
            <View style={styles.playButtonInner}>
              <Ionicons 
                name={isPlaying ? "pause" : "play"} 
                size={18} 
                color={colors.text} 
                style={isPlaying ? {} : { marginLeft: 2 }}
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Crisp Progress Hairline (No glow) */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} />
        </View>
      </BlurView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  blurCard: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    position: 'relative',
  },
  specularSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    pointerEvents: 'none',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  artworkWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    backgroundColor: '#E2E8F0',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  artworkPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    letterSpacing: -0.2,
  },
  artist: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    marginLeft: spacing.sm,
  },
  playButtonInner: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressTrack: {
    height: 2.5,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.tint,
  },
});
