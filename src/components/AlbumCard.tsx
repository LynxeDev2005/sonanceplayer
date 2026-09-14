import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography, spacing, radii } from '../theme';

export interface AlbumCardProps {
  title: string;
  artist: string;
  artworkPath?: string | null;
  onPress?: () => void;
  size?: number;
}

export function AlbumCard({ title, artist, artworkPath, onPress, size }: AlbumCardProps) {
  const { width } = useWindowDimensions();
  const cardSize = size || (width - spacing.lg * 2 - spacing.md) / 2;

  return (
    <TouchableOpacity 
      style={[styles.container, { width: cardSize }]} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.artworkContainer, { width: cardSize, height: cardSize }]}>
        {artworkPath ? (
          <Image source={{ uri: artworkPath }} style={styles.artworkImage} />
        ) : (
          <LinearGradient 
            colors={['#3B82F6', '#1E40AF']} 
            style={styles.placeholderGradient}
          >
            <Ionicons name="musical-notes" size={cardSize * 0.35} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        )}
      </View>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <Text style={styles.artist} numberOfLines={1}>{artist}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  artworkContainer: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    marginBottom: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
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
  title: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginTop: 2,
  },
  artist: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
