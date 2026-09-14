import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList, ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radii } from '../../src/theme';
import { MiniPlayer } from '../../src/components/MiniPlayer';
import { TrackRow } from '../../src/components/TrackRow';
import { AlbumCard } from '../../src/components/AlbumCard';
import { GlassPill } from '../../src/components/GlassPill';
import { TrackActionModal } from '../../src/components/TrackActionModal';
import { router, useFocusEffect } from 'expo-router';

import { PlayerController } from '../../src/player/PlayerController';
import { usePlaybackState } from '../../src/player/hooks';
import { getAllTracks, getRecentlyAddedTracks, DBTrack } from '../../src/data/database';
import { TrackInfo } from '../../modules/sonance-audio/src';

export default function LibraryScreen() {
  const [tracks, setTracks] = useState<DBTrack[]>([]);
  const [recentTracks, setRecentTracks] = useState<DBTrack[]>([]);
  const playbackState = usePlaybackState();

  useFocusEffect(
    React.useCallback(() => {
      loadLibrary();
    }, [])
  );

  const loadLibrary = () => {
    const all = getAllTracks();
    setTracks(all);
    setRecentTracks(getRecentlyAddedTracks(8));
  };

  const handleTrackPress = (track: DBTrack, index: number) => {
    const mappedTracks: TrackInfo[] = tracks.map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      filePath: t.file_path,
      artworkUrl: t.artwork_path || undefined,
      duration: t.duration || undefined,
    }));
    
    PlayerController.setQueue(mappedTracks, index);
    router.push('/player');
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Title & Action Buttons */}
      <View style={styles.titleRow}>
        <Text style={styles.largeTitle}>Library</Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.iconCircleButton}
            onPress={() => router.push('/search')}
          >
            <Ionicons name="search" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.iconCircleButton, styles.importButton]}
            onPress={() => router.push('/import')}
          >
            <Ionicons name="add" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Category Filters */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.filtersScroll}
        contentContainerStyle={styles.filtersContainer}
      >
        <GlassPill label="Playlists" onPress={() => router.push('/playlists')} style={styles.pill} />
        <GlassPill label="Artists" onPress={() => {}} style={styles.pill} />
        <GlassPill label="Albums" onPress={() => {}} style={styles.pill} />
        <GlassPill label="Downloaded" isActive onPress={() => {}} style={styles.pill} />
      </ScrollView>

      {/* Recently Added Section */}
      {recentTracks.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionHeaderTitle}>Recently Added</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.recentScrollContent}
          >
            {recentTracks.map(track => (
              <View key={track.id} style={styles.recentCardWrapper}>
                <AlbumCard 
                  title={track.title} 
                  artist={track.artist}
                  artworkPath={track.artwork_path}
                  size={120}
                  onPress={() => {
                    const idx = tracks.findIndex(t => t.id === track.id);
                    if (idx !== -1) handleTrackPress(track, idx);
                  }}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Songs Section Header */}
      <View style={styles.songsHeaderRow}>
        <Text style={styles.sectionHeaderTitle}>All Songs</Text>
        <Text style={styles.trackCountBadge}>{tracks.length} {tracks.length === 1 ? 'song' : 'songs'}</Text>
      </View>
    </View>
  );

  const [selectedTrackForMenu, setSelectedTrackForMenu] = useState<DBTrack | null>(null);

  const renderTrack = ({ item, index }: ListRenderItemInfo<DBTrack>) => {
    const isCurrent = playbackState.currentTrack?.id === item.id;
    return (
      <TrackRow 
        title={item.title} 
        artist={item.artist}
        artworkPath={item.artwork_path}
        isActive={isCurrent}
        onPress={() => handleTrackPress(item, index)}
        onMorePress={() => setSelectedTrackForMenu(item)}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <FlatList
        data={tracks}
        keyExtractor={item => item.id}
        renderItem={renderTrack}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="musical-notes-outline" size={56} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>Your Library is Empty</Text>
            <Text style={styles.emptySubtitle}>Import MP3, FLAC, or M4A audio files to get started.</Text>
            <TouchableOpacity 
              style={styles.emptyImportButton} 
              onPress={() => router.push('/import')}
            >
              <Ionicons name="add-circle" size={20} color={colors.white} style={{ marginRight: 6 }} />
              <Text style={styles.emptyImportButtonText}>Import Music</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={styles.scrollContent}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={5}
        removeClippedSubviews={true}
      />
      
      <MiniPlayer />

      <TrackActionModal 
        visible={selectedTrackForMenu !== null}
        track={selectedTrackForMenu}
        onClose={() => setSelectedTrackForMenu(null)}
        onTrackDeleted={() => {
          loadLibrary();
          setSelectedTrackForMenu(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 160,
  },
  headerContainer: {
    paddingTop: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  largeTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconCircleButton: {
    width: 38,
    height: 38,
    borderRadius: radii.round,
    backgroundColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  importButton: {
    backgroundColor: colors.tint,
  },
  filtersScroll: {
    marginBottom: spacing.md,
  },
  filtersContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  pill: {
    marginRight: spacing.sm,
  },
  recentSection: {
    marginBottom: spacing.lg,
  },
  sectionHeaderTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  recentScrollContent: {
    paddingHorizontal: spacing.lg,
  },
  recentCardWrapper: {
    marginRight: spacing.md,
  },
  songsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: spacing.lg,
    marginBottom: spacing.xs,
  },
  trackCountBadge: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 1.5,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  emptyImportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tint,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.round,
  },
  emptyImportButtonText: {
    color: colors.white,
    fontWeight: typography.weights.semibold,
    fontSize: typography.sizes.sm,
  },
});
