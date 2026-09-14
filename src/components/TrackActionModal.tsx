import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Crypto from 'expo-crypto';
import { colors, typography, spacing, radii } from '../theme';
import { PlayerController } from '../player/PlayerController';
import {
  DBTrack,
  getAllPlaylists,
  addTrackToPlaylist,
  createPlaylist,
  deleteTrack,
  DBPlaylist,
} from '../data/database';
import { TrackInfo } from '../../modules/sonance-audio/src';

export interface TrackActionModalProps {
  visible: boolean;
  track: DBTrack | TrackInfo | null;
  onClose: () => void;
  onTrackDeleted?: () => void;
}

export function TrackActionModal({
  visible,
  track,
  onClose,
  onTrackDeleted,
}: TrackActionModalProps) {
  const [viewMode, setViewMode] = useState<'main' | 'playlist' | 'details'>('main');
  const [playlists, setPlaylists] = useState<DBPlaylist[]>([]);

  if (!track) return null;

  const handleOpenPlaylists = () => {
    const list = getAllPlaylists();
    setPlaylists(list);
    setViewMode('playlist');
  };

  const handleAddToPlaylist = (playlist: DBPlaylist) => {
    addTrackToPlaylist(playlist.id, track.id);
    Alert.alert("Added to Playlist", `"${track.title}" added to ${playlist.name}.`);
    handleClose();
  };

  const handleCreateNewPlaylist = () => {
    Alert.prompt(
      "New Playlist",
      "Enter a name for the new playlist:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create & Add",
          onPress: (name?: string) => {
            if (name && name.trim()) {
              const newId = Crypto.randomUUID();
              createPlaylist(newId, name.trim());
              addTrackToPlaylist(newId, track.id);
              Alert.alert("Success", `Playlist "${name.trim()}" created and track added.`);
              handleClose();
            }
          },
        },
      ],
      "plain-text"
    );
  };

  const handlePlayNow = () => {
    const trackInfo: TrackInfo = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      filePath: 'file_path' in track ? track.file_path : track.filePath,
      artworkUrl: ('artwork_path' in track ? track.artwork_path : track.artworkUrl) || undefined,
      duration: durationSec || undefined,
    };
    PlayerController.loadTrack(trackInfo);
    PlayerController.play();
    handleClose();
  };

  const handlePlayNext = () => {
    const trackInfo: TrackInfo = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      filePath: 'file_path' in track ? track.file_path : track.filePath,
      artworkUrl: ('artwork_path' in track ? track.artwork_path : track.artworkUrl) || undefined,
      duration: durationSec || undefined,
    };
    PlayerController.playNext(trackInfo);
    Alert.alert("Queue Updated", `"${track.title}" will play next.`);
    handleClose();
  };

  const handleAddToQueue = () => {
    const trackInfo: TrackInfo = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      filePath: 'file_path' in track ? track.file_path : track.filePath,
      artworkUrl: ('artwork_path' in track ? track.artwork_path : track.artworkUrl) || undefined,
      duration: durationSec || undefined,
    };
    PlayerController.addToQueue(trackInfo);
    Alert.alert("Queue Updated", `"${track.title}" added to the end of queue.`);
    handleClose();
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Song",
      `Are you sure you want to remove "${track.title}" from your library?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteTrack(track.id);
            if (onTrackDeleted) onTrackDeleted();
            handleClose();
          },
        },
      ]
    );
  };

  const handleClose = () => {
    setViewMode('main');
    onClose();
  };

  const artworkUri = 'artwork_path' in track ? track.artwork_path : track.artworkUrl;
  const filePath = 'file_path' in track ? track.file_path : track.filePath;
  const durationSec: number = ('duration' in track && typeof track.duration === 'number') ? track.duration : 0;
  const formatDuration = (sec: number = 0) => {
    const totalSecs = Math.floor(sec);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = Math.floor(totalSecs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.sheetContainer}>
              <BlurView intensity={95} tint="light" style={styles.blurCard}>
                {/* Specular Rim Light */}
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.0)']}
                  style={styles.specularRim}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                />

                {/* Drag Indicator Handle */}
                <View style={styles.handleBar} />

                {/* Track Preview Header */}
                <View style={styles.header}>
                  <View style={styles.artwork}>
                    {artworkUri ? (
                      <Image source={{ uri: artworkUri }} style={styles.artworkImage} />
                    ) : (
                      <LinearGradient colors={['#6366F1', '#4338CA']} style={styles.artworkPlaceholder}>
                        <Ionicons name="musical-note" size={24} color="#FFFFFF" />
                      </LinearGradient>
                    )}
                  </View>
                  <View style={styles.headerInfo}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>
                      {track.artist}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.divider} />

                {/* VIEW: Main Action Menu */}
                {viewMode === 'main' && (
                  <View style={styles.actionList}>
                    {/* Play Now */}
                    <TouchableOpacity style={styles.actionRow} onPress={handlePlayNow} activeOpacity={0.7}>
                      <View style={[styles.actionIconBox, { backgroundColor: 'rgba(0, 122, 255, 0.12)' }]}>
                        <Ionicons name="play" size={20} color={colors.tint} style={{ marginLeft: 2 }} />
                      </View>
                      <Text style={[styles.actionText, { color: colors.tint, fontWeight: '600' }]}>Play Now</Text>
                    </TouchableOpacity>

                    {/* Play Next */}
                    <TouchableOpacity style={styles.actionRow} onPress={handlePlayNext} activeOpacity={0.7}>
                      <View style={styles.actionIconBox}>
                        <Ionicons name="play-skip-forward-outline" size={20} color={colors.text} />
                      </View>
                      <Text style={styles.actionText}>Play Next</Text>
                    </TouchableOpacity>

                    {/* Add to Queue */}
                    <TouchableOpacity style={styles.actionRow} onPress={handleAddToQueue} activeOpacity={0.7}>
                      <View style={styles.actionIconBox}>
                        <Ionicons name="list-outline" size={20} color={colors.text} />
                      </View>
                      <Text style={styles.actionText}>Add to Queue</Text>
                    </TouchableOpacity>

                    {/* Add to Playlist */}
                    <TouchableOpacity style={styles.actionRow} onPress={handleOpenPlaylists} activeOpacity={0.7}>
                      <View style={styles.actionIconBox}>
                        <Ionicons name="add-circle-outline" size={20} color={colors.text} />
                      </View>
                      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.actionText}>Add to Playlist</Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                      </View>
                    </TouchableOpacity>

                    {/* Song Details */}
                    <TouchableOpacity style={styles.actionRow} onPress={() => setViewMode('details')} activeOpacity={0.7}>
                      <View style={styles.actionIconBox}>
                        <Ionicons name="information-circle-outline" size={20} color={colors.text} />
                      </View>
                      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.actionText}>Song Details</Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                      </View>
                    </TouchableOpacity>

                    <View style={styles.actionDivider} />

                    {/* Delete Track */}
                    <TouchableOpacity style={styles.actionRow} onPress={handleDelete} activeOpacity={0.7}>
                      <View style={[styles.actionIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                      </View>
                      <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete from Library</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* VIEW: Add to Playlist */}
                {viewMode === 'playlist' && (
                  <View style={styles.subViewContainer}>
                    <View style={styles.subViewHeader}>
                      <TouchableOpacity onPress={() => setViewMode('main')} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={20} color={colors.tint} />
                        <Text style={styles.backButtonText}>Back</Text>
                      </TouchableOpacity>
                      <Text style={styles.subViewTitle}>Add to Playlist</Text>
                      <View style={{ width: 60 }} />
                    </View>

                    <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                      <TouchableOpacity style={styles.newPlaylistBtn} onPress={handleCreateNewPlaylist} activeOpacity={0.7}>
                        <View style={[styles.actionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                          <Ionicons name="add" size={22} color="#10B981" />
                        </View>
                        <Text style={[styles.actionText, { color: '#10B981', fontWeight: '600' }]}>New Playlist...</Text>
                      </TouchableOpacity>

                      {playlists.map((pl) => (
                        <TouchableOpacity
                          key={pl.id}
                          style={styles.playlistRow}
                          onPress={() => handleAddToPlaylist(pl)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="musical-notes" size={18} color={colors.textSecondary} style={{ marginRight: 12 }} />
                          <Text style={styles.actionText}>{pl.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* VIEW: Song Details */}
                {viewMode === 'details' && (
                  <View style={styles.subViewContainer}>
                    <View style={styles.subViewHeader}>
                      <TouchableOpacity onPress={() => setViewMode('main')} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={20} color={colors.tint} />
                        <Text style={styles.backButtonText}>Back</Text>
                      </TouchableOpacity>
                      <Text style={styles.subViewTitle}>Song Details</Text>
                      <View style={{ width: 60 }} />
                    </View>

                    <View style={styles.detailsBox}>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Title</Text>
                        <Text style={styles.detailValue} numberOfLines={2}>{track.title}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Artist</Text>
                        <Text style={styles.detailValue} numberOfLines={1}>{track.artist}</Text>
                      </View>
                      {durationSec > 0 && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Duration</Text>
                          <Text style={styles.detailValue}>{formatDuration(durationSec)}</Text>
                        </View>
                      )}
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>File Path</Text>
                        <Text style={styles.detailValue} numberOfLines={2}>{filePath}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </BlurView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
    padding: 16,
    paddingBottom: 32,
  },
  sheetContainer: {
    width: '100%',
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 25,
    elevation: 12,
  },
  blurCard: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 1)',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    position: 'relative',
  },
  specularRim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 24,
    pointerEvents: 'none',
  },
  handleBar: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  artwork: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
  },
  artworkPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 14,
  },
  trackTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  trackArtist: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginBottom: 12,
  },
  actionList: {
    gap: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  actionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  subViewContainer: {
    paddingTop: 4,
  },
  subViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.tint,
  },
  subViewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  newPlaylistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  detailsBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    width: 80,
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'right',
  },
});
