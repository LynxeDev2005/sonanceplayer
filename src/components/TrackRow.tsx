import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography, spacing, radii } from '../theme';
import { triggerLightImpact, triggerSelection } from '../utils/haptics';

export interface TrackRowProps {
  title: string;
  artist: string;
  artworkPath?: string | null;
  onPress: () => void;
  isActive?: boolean;
  onMorePress?: () => void;
}

export function TrackRow({ title, artist, artworkPath, onPress, isActive, onMorePress }: TrackRowProps) {
  return (
    <TouchableOpacity 
      style={[styles.container, isActive && styles.activeContainer]} 
      onPress={() => {
        triggerSelection();
        onPress();
      }}
      activeOpacity={0.65}
    >
      <View style={styles.artwork}>
        {artworkPath ? (
          <Image source={{ uri: artworkPath }} style={styles.artworkImage} />
        ) : (
          <LinearGradient colors={['#6366F1', '#4338CA']} style={styles.placeholderGradient}>
            <Ionicons name="musical-note" size={20} color="rgba(255,255,255,0.8)" />
          </LinearGradient>
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, isActive && styles.activeText]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {artist}
        </Text>
      </View>
      <TouchableOpacity 
        style={styles.moreButton} 
        onPress={(e) => {
          e.stopPropagation();
          triggerLightImpact();
          onMorePress && onMorePress();
        }}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
  activeContainer: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  artwork: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
  },
  placeholderGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.text,
    letterSpacing: -0.2,
  },
  activeText: {
    color: colors.tint,
    fontWeight: typography.weights.bold,
  },
  artist: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  moreButton: {
    padding: spacing.sm,
  },
});
