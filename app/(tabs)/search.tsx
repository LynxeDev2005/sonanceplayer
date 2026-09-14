import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography, spacing, radii } from '../../src/theme';
import { TrackRow } from '../../src/components/TrackRow';
import { MiniPlayer } from '../../src/components/MiniPlayer';
import { TrackActionModal } from '../../src/components/TrackActionModal';
import { searchTracks, DBTrack, getRecentlyPlayed } from '../../src/data/database';
import { PlayerController } from '../../src/player/PlayerController';
import { usePlaybackState } from '../../src/player/hooks';
import { router, useFocusEffect } from 'expo-router';
import { TrackInfo } from '../../modules/sonance-audio/src';

const GENRE_TAGS = [
  { name: 'Electronic', colors: ['#4F46E5', '#7C3AED'] as const },
  { name: 'Pop & Rock', colors: ['#EC4899', '#F43F5E'] as const },
  { name: 'Hip-Hop', colors: ['#F59E0B', '#D97706'] as const },
  { name: 'Ambient & Lo-Fi', colors: ['#10B981', '#059669'] as const },
];

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DBTrack[]>([]);
  const [recent, setRecent] = useState<DBTrack[]>([]);
  const playbackState = usePlaybackState();

  useFocusEffect(
    React.useCallback(() => {
      setRecent(getRecentlyPlayed(10));
    }, [])
  );

  useEffect(() => {
    if (query.trim() === '') {
      setResults([]);
    } else {
      const tracks = searchTracks(query).slice(0, 200);
      setResults(tracks);
    }
  }, [query]);

  const handleTrackPress = (track: DBTrack, index: number, playlist: DBTrack[]) => {
    const mappedTracks: TrackInfo[] = playlist.map(t => ({
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

  const isSearchActive = query.trim() !== '';

  const renderHeader = () => (
    <View>
      <Text style={styles.largeTitle}>Search</Text>
      
      {/* Search Input Bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput 
          style={styles.searchInput}
          placeholder="Songs, artists, albums..."
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} style={styles.clearButton}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {!isSearchActive && (
        <>
          {/* Browse Categories */}
          <Text style={styles.sectionHeaderTitle}>Browse Categories</Text>
          <View style={styles.genreGrid}>
            {GENRE_TAGS.map((genre) => (
              <TouchableOpacity 
                key={genre.name} 
                style={styles.genreCardWrapper}
                onPress={() => setQuery(genre.name)}
                activeOpacity={0.8}
              >
                <LinearGradient colors={genre.colors} style={styles.genreCard}>
                  <Text style={styles.genreName}>{genre.name}</Text>
                  <Ionicons name="musical-notes" size={24} color="rgba(255,255,255,0.4)" style={styles.genreIcon} />
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>

          {/* Recently Played Header */}
          {recent.length > 0 && (
            <Text style={[styles.sectionHeaderTitle, { marginTop: spacing.lg }]}>
              Recently Played
            </Text>
          )}
        </>
      )}

      {isSearchActive && (
        <Text style={styles.sectionHeaderTitle}>
          {results.length > 0 ? `Results (${results.length})` : 'No results'}
        </Text>
      )}
    </View>
  );

  const [selectedTrackForMenu, setSelectedTrackForMenu] = useState<DBTrack | null>(null);

  const renderTrack = ({ item, index }: ListRenderItemInfo<DBTrack>) => {
    const list = isSearchActive ? results : recent;
    const isCurrent = playbackState.currentTrack?.id === item.id;
    return (
      <TrackRow 
        title={item.title}
        artist={item.artist}
        artworkPath={item.artwork_path}
        isActive={isCurrent}
        onPress={() => handleTrackPress(item, index, list)}
        onMorePress={() => setSelectedTrackForMenu(item)}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <FlatList
        data={isSearchActive ? results : recent}
        keyExtractor={item => item.id}
        renderItem={renderTrack}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          isSearchActive ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No results found for "{query}"</Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.scrollContent}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={5}
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={false}
      />
      <MiniPlayer />

      <TrackActionModal 
        visible={selectedTrackForMenu !== null}
        track={selectedTrackForMenu}
        onClose={() => setSelectedTrackForMenu(null)}
        onTrackDeleted={() => {
          if (isSearchActive) {
            setResults(searchTracks(query).slice(0, 200));
          } else {
            setRecent(getRecentlyPlayed(10));
          }
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
  largeTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    marginBottom: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radii.lg,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  clearButton: {
    padding: spacing.xs,
  },
  sectionHeaderTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  genreCardWrapper: {
    width: '48%',
    height: 72,
    marginBottom: spacing.xs,
  },
  genreCard: {
    flex: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  genreName: {
    color: colors.white,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm,
  },
  genreIcon: {
    position: 'absolute',
    right: 8,
    bottom: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.md,
    marginTop: spacing.sm,
  },
});
