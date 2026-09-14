import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, useWindowDimensions, PanResponder, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidBackground } from '../src/components/LiquidBackground';
import { TrackActionModal } from '../src/components/TrackActionModal';
import { colors, typography, spacing, radii } from '../src/theme';
import { PlayerController } from '../src/player/PlayerController';
import { usePlaybackState } from '../src/player/hooks';
import { TrackInfo } from '../modules/sonance-audio/src';
import { triggerLightImpact, triggerMediumImpact, triggerSelection } from '../src/utils/haptics';

export default function PlayerScreen() {
  const { width } = useWindowDimensions();
  const playbackState = usePlaybackState();
  const { currentTrack, isPlaying, shuffle, repeatMode, currentIndex, position = 0, duration = 1 } = playbackState;
  
  const [showQueue, setShowQueue] = useState(false);
  const [sleepTimerActive, setSleepTimerActive] = useState(false);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);
  const [selectedTrackForMenu, setSelectedTrackForMenu] = useState<TrackInfo | null>(null);

  // Responsive Drag State for Slider
  const [isDragging, setIsDragging] = useState(false);
  const [dragRatio, setDragRatio] = useState(0);
  const [optimisticRatio, setOptimisticRatio] = useState<number | null>(null);
  const [trackWidth, setTrackWidth] = useState(width - 48);

  const safeDuration = duration > 0 
    ? duration 
    : (currentTrack?.duration && currentTrack.duration > 0 ? currentTrack.duration : 1);
  const progressRatio = Math.max(0, Math.min(1, position / safeDuration));

  const startRatioRef = useRef(0);
  const currentRatioRef = useRef(0);
  const trackWidthRef = useRef(width - 48);
  const safeDurationRef = useRef(safeDuration);
  const lastHapticRatioRef = useRef(0);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragRatioRef = useRef(0);
  const seekConfirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  trackWidthRef.current = trackWidth;
  safeDurationRef.current = safeDuration;

  // Fluid Elastic Spring Stretch Animation (iOS Settings Switch Effect)
  const stretchAnim = useRef(new Animated.Value(0)).current;

  // PanResponder can deliver several move events in one frame. Coalescing them
  // keeps the playhead and time labels smooth without flooding React renders.
  const updateDragRatio = (ratio: number) => {
    pendingDragRatioRef.current = ratio;
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      setDragRatio(pendingDragRatioRef.current);
    });
  };

  const clearOptimisticSeek = () => {
    if (seekConfirmationTimerRef.current) {
      clearTimeout(seekConfirmationTimerRef.current);
      seekConfirmationTimerRef.current = null;
    }
    setOptimisticRatio(null);
  };

  // 60FPS Smooth Dragging PanResponder with Elastic Stretch & Haptics
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => safeDurationRef.current > 1,
      onMoveShouldSetPanResponder: () => safeDurationRef.current > 1,
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        clearOptimisticSeek();
        triggerMediumImpact();
        
        Animated.spring(stretchAnim, {
          toValue: 1,
          damping: 14,
          stiffness: 280,
          mass: 0.6,
          useNativeDriver: true,
        }).start();

        const touchX = evt.nativeEvent.locationX;
        const initialRatio = Math.max(0, Math.min(1, touchX / (trackWidthRef.current || 1)));
        startRatioRef.current = initialRatio;
        currentRatioRef.current = initialRatio;
        lastHapticRatioRef.current = initialRatio;
        updateDragRatio(initialRatio);
      },
      onPanResponderMove: (evt, gestureState) => {
        const deltaRatio = gestureState.dx / (trackWidthRef.current || 1);
        const newRatio = Math.max(0, Math.min(1, startRatioRef.current + deltaRatio));
        currentRatioRef.current = newRatio;
        updateDragRatio(newRatio);

        // Tactile ticking gear haptic feedback every 3.5%
        if (Math.abs(newRatio - lastHapticRatioRef.current) >= 0.035) {
          triggerSelection();
          lastHapticRatioRef.current = newRatio;
        }
      },
      onPanResponderRelease: () => {
        const finalRatio = currentRatioRef.current;
        setOptimisticRatio(finalRatio);
        setIsDragging(false);
        triggerLightImpact();

        Animated.spring(stretchAnim, {
          toValue: 0,
          damping: 12,
          stiffness: 240,
          mass: 0.7,
          useNativeDriver: true,
        }).start();

        PlayerController.seek(finalRatio * safeDurationRef.current);
        // Keep the thumb pinned until the native engine confirms the new time.
        // The timeout is only a fallback for files that cannot report a duration.
        seekConfirmationTimerRef.current = setTimeout(clearOptimisticSeek, 1500);
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        clearOptimisticSeek();
        Animated.spring(stretchAnim, {
          toValue: 0,
          damping: 12,
          stiffness: 240,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const queue = PlayerController.getQueue();

  useEffect(() => {
    if (optimisticRatio === null || isDragging) return;
    // Release the optimistic thumb as soon as native playback reports the seek.
    if (Math.abs(progressRatio - optimisticRatio) < 0.015) {
      clearOptimisticSeek();
    }
  }, [isDragging, optimisticRatio, progressRatio]);

  useEffect(() => () => {
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
    if (seekConfirmationTimerRef.current) clearTimeout(seekConfirmationTimerRef.current);
  }, []);

  // Sleep Timer Countdown
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (sleepTimerActive && sleepTimerRemaining !== null && sleepTimerRemaining > 0) {
      interval = setInterval(() => {
        setSleepTimerRemaining(prev => prev !== null ? prev - 1 : null);
      }, 1000);
    } else if (sleepTimerActive && sleepTimerRemaining === 0) {
      PlayerController.pause();
      setSleepTimerActive(false);
      setSleepTimerRemaining(null);
    }
    return () => clearInterval(interval);
  }, [sleepTimerActive, sleepTimerRemaining]);

  const toggleSleepTimer = () => {
    if (sleepTimerActive) {
      setSleepTimerActive(false);
      setSleepTimerRemaining(null);
    } else {
      setSleepTimerActive(true);
      setSleepTimerRemaining(15 * 60);
    }
  };

  const formatTime = (seconds: number = 0) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const totalSecs = Math.floor(seconds);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = Math.floor(totalSecs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const activeRatio = isDragging 
    ? dragRatio 
    : (optimisticRatio !== null ? optimisticRatio : progressRatio);
  const displayPosition = isDragging 
    ? dragRatio * safeDuration 
    : (optimisticRatio !== null ? optimisticRatio * safeDuration : position);
  const displayRemaining = Math.max(0, safeDuration - displayPosition);

  // Switch stretch interpolations (matches iOS liquid glass slider)
  const scaleX = stretchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.55],
  });

  const scaleY = stretchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.96],
  });

  const glassOpacity = stretchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const solidOpacity = stretchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <View style={styles.container}>
      {/* 4-Oscillator Harmonic Light Mode Liquid Glass Background */}
      <LiquidBackground style={StyleSheet.absoluteFill} blurIntensity={88} showCaustics={true} />

      <SafeAreaView style={styles.safeArea}>
        {/* Liquid Glass Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={styles.liquidHeaderBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-down" size={24} color={colors.text} />
          </TouchableOpacity>
          
          <View style={styles.headerTitleCapsule}>
            <Text style={styles.headerTitle}>NOW PLAYING</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity 
              onPress={() => router.push('/equalizer')} 
              style={styles.liquidHeaderBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="options-outline" size={20} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={toggleSleepTimer} 
              style={[styles.liquidHeaderBtn, sleepTimerActive && styles.liquidActiveHeaderBtn]}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={sleepTimerActive ? "timer" : "timer-outline"} 
                size={20} 
                color={sleepTimerActive ? colors.tint : colors.text} 
              />
            </TouchableOpacity>
          </View>
        </View>

        {sleepTimerActive && (
          <View style={styles.timerBadge}>
            <Text style={styles.timerBadgeText}>
              Sleeps in {formatTime(sleepTimerRemaining || 0)}
            </Text>
          </View>
        )}

        {!showQueue ? (
          <ScrollView 
            contentContainerStyle={styles.scrollBody} 
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Artwork Liquid Glass Bezel */}
            <View style={styles.artworkContainer}>
              <View style={styles.artworkGlassBezel}>
                {currentTrack?.artworkUrl ? (
                  <Image source={{ uri: currentTrack.artworkUrl }} style={styles.artworkImage} />
                ) : (
                  <LinearGradient 
                    colors={['#1E293B', '#0F172A']} 
                    style={styles.artworkPlaceholder}
                  >
                    <Image 
                      source={require('../assets/sonance-logo-white.png')} 
                      style={{ width: 175, height: 45, resizeMode: 'contain' }} 
                    />
                  </LinearGradient>
                )}
              </View>
            </View>

            {/* Info & Queue Toggle Row */}
            <View style={styles.infoRow}>
              <View style={{ flex: 1, paddingRight: spacing.sm }}>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {currentTrack?.title || 'Not Playing'}
                </Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {currentTrack?.artist || 'Sonance Audio'}
                </Text>
              </View>
              <View style={styles.headerBtnGroup}>
                {currentTrack && (
                  <TouchableOpacity 
                    style={styles.queueButton}
                    onPress={() => setSelectedTrackForMenu(currentTrack)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  style={styles.queueButton}
                  onPress={() => setShowQueue(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="list" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Liquid Glass Scrubber Slider (Fluid Elastic Switch Morphing) */}
            <View style={styles.sliderContainer}>
              <View 
                style={styles.sliderTouchArea}
                onLayout={(e) => {
                  const layoutWidth = e.nativeEvent.layout.width;
                  if (layoutWidth > 0) setTrackWidth(layoutWidth);
                }}
                {...panResponder.panHandlers}
              >
                {/* Slim Clean Track */}
                <View style={styles.glassTrack}>
                  {/* Active Blue Progress Fill */}
                  <View style={[styles.liquidFill, { width: `${activeRatio * 100}%` }]} />
                  
                  {/* Elastic Spring Playhead with Switch Morph Physics */}
                  <Animated.View 
                    style={[
                      styles.playheadBase,
                      { 
                        left: `${activeRatio * 100}%`,
                        transform: [{ scaleX }, { scaleY }],
                      },
                    ]}
                  >
                    {/* Solid White Idle iOS Knob */}
                    <Animated.View style={[styles.playheadSolidLayer, { opacity: solidOpacity }]} />

                    {/* Crystal Clear Liquid Glass Active Lens */}
                    <Animated.View style={[styles.playheadGlassLayer, { opacity: glassOpacity }]}>
                      <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
                      <LinearGradient
                        colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.0)']}
                        style={styles.glassTopSheen}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                      />
                      <LinearGradient
                        colors={['rgba(255, 255, 255, 0.0)', 'rgba(255, 255, 255, 0.4)']}
                        style={styles.glassBottomSheen}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                      />
                    </Animated.View>
                  </Animated.View>

                  {isDragging && (
                    <View
                      pointerEvents="none"
                      style={[styles.scrubTimeBubble, { left: `${activeRatio * 100}%` }]}
                    >
                      <Text style={styles.scrubTimeText}>{formatTime(displayPosition)}</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>{formatTime(displayPosition)}</Text>
                <Text style={styles.timeLabel}>-{formatTime(displayRemaining)}</Text>
              </View>
            </View>

            {/* Liquid Controls Island */}
            <View style={styles.controlsIsland}>
              {/* Shuffle Button with Liquid Clear Highlighter */}
              <TouchableOpacity 
                onPress={() => {
                  triggerSelection();
                  PlayerController.toggleShuffle();
                }}
                style={[styles.miniControlBtn, shuffle && styles.liquidActiveControl]}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name="shuffle" 
                  size={22} 
                  color={shuffle ? colors.tint : colors.textSecondary} 
                />
              </TouchableOpacity>
              
              {/* Previous Button */}
              <TouchableOpacity 
                onPress={() => {
                  triggerLightImpact();
                  PlayerController.previous();
                }}
                style={styles.skipButton}
                activeOpacity={0.7}
              >
                <Ionicons name="play-back" size={28} color={colors.text} />
              </TouchableOpacity>
              
              {/* Center Liquid Glass Play/Pause Button */}
              <TouchableOpacity 
                style={styles.centerPlayButton}
                onPress={() => {
                  triggerLightImpact();
                  PlayerController.togglePlayPause();
                }}
                activeOpacity={0.85}
              >
                <View style={styles.centerPlayInner}>
                  <Ionicons 
                    name={isPlaying ? "pause" : "play"} 
                    size={36} 
                    color={colors.text} 
                    style={isPlaying ? {} : { marginLeft: 3 }} 
                  />
                </View>
              </TouchableOpacity>
              
              {/* Next Button */}
              <TouchableOpacity 
                onPress={() => {
                  triggerLightImpact();
                  PlayerController.next();
                }}
                style={styles.skipButton}
                activeOpacity={0.7}
              >
                <Ionicons name="play-forward" size={28} color={colors.text} />
              </TouchableOpacity>
              
              {/* Repeat Button with Liquid Clear Highlighter */}
              <TouchableOpacity 
                onPress={() => {
                  triggerSelection();
                  PlayerController.toggleRepeatMode();
                }}
                style={[styles.miniControlBtn, repeatMode !== 'off' && styles.liquidActiveControl]}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={repeatMode === 'track' ? "repeat-outline" : "repeat"} 
                  size={22} 
                  color={repeatMode !== 'off' ? colors.tint : colors.textSecondary} 
                />
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          /* Liquid Queue Sheet in Light Mode */
          <View style={styles.queueSheet}>
            <View style={styles.queueHeader}>
              <Text style={styles.queueTitle}>Up Next ({queue.length})</Text>
              <TouchableOpacity 
                style={styles.queueCloseBtn}
                onPress={() => setShowQueue(false)}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.queueList} showsVerticalScrollIndicator={false}>
              {queue.map((track, idx) => {
                const isActive = idx === currentIndex;
                return (
                  <TouchableOpacity
                    key={track.id + idx} 
                    style={[styles.queueItem, isActive && styles.activeQueueItem]}
                    onPress={() => PlayerController.setQueue(queue, idx)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.queueItemIndex}>
                      {isActive ? (
                        <Ionicons name="volume-high" size={18} color={colors.tint} />
                      ) : (
                        <Text style={styles.queueIndexText}>{idx + 1}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.queueTrackTitle, isActive && { color: colors.tint, fontWeight: '700' }]} numberOfLines={1}>
                        {track.title}
                      </Text>
                      <Text style={styles.queueTrackArtist} numberOfLines={1}>{track.artist}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.queueMoreBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        setSelectedTrackForMenu(track);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </SafeAreaView>

      {/* iOS Liquid Glass Track Action Modal */}
      <TrackActionModal 
        visible={selectedTrackForMenu !== null}
        track={selectedTrackForMenu}
        onClose={() => setSelectedTrackForMenu(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  liquidHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 1)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  liquidActiveHeaderBtn: {
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    borderColor: 'rgba(37, 99, 235, 0.3)',
  },
  headerTitleCapsule: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.round,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.textSecondary,
  },
  timerBadge: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.round,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
    marginTop: 2,
  },
  timerBadgeText: {
    color: colors.tint,
    fontSize: typography.sizes.xs,
    fontWeight: '600',
  },
  scrollBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    justifyContent: 'space-around',
    flexGrow: 1,
  },
  artworkContainer: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  artworkGlassBezel: {
    width: '100%',
    maxWidth: 340,
    aspectRatio: 1,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 25,
    elevation: 10,
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  trackTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  trackArtist: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  queueButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 1)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  sliderContainer: {
    marginBottom: spacing.lg,
    paddingHorizontal: 4,
  },
  sliderTouchArea: {
    minHeight: 48,
    paddingVertical: 18,
    justifyContent: 'center',
  },
  glassTrack: {
    height: 6,
    backgroundColor: '#E5E5EA',
    borderRadius: 3,
    overflow: 'visible',
    position: 'relative',
    justifyContent: 'center',
  },
  liquidFill: {
    height: 6,
    backgroundColor: '#007AFF',
    borderRadius: 3,
  },
  playheadBase: {
    position: 'absolute',
    top: -11,
    marginLeft: -16, // Centers 32px width on touch point
    width: 32,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  scrubTimeBubble: {
    position: 'absolute',
    top: -42,
    marginLeft: -27,
    minWidth: 54,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.round,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
  },
  scrubTimeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  playheadSolidLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  playheadGlassLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    borderTopColor: 'rgba(255, 255, 255, 1.0)',
    borderBottomColor: 'rgba(255, 255, 255, 0.75)',
  },
  glassTopSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 8,
  },
  glassBottomSheen: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  timeLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  controlsIsland: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  miniControlBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  liquidActiveControl: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderRadius: 21,
  },
  skipButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 1)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  centerPlayButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 6,
  },
  centerPlayInner: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  queueSheet: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 1)',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
  },
  queueTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '800',
    color: colors.text,
  },
  queueCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  queueList: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    marginBottom: 4,
  },
  activeQueueItem: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  queueItemIndex: {
    width: 28,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  queueIndexText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontWeight: '600',
  },
  queueTrackTitle: {
    fontSize: typography.sizes.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  queueTrackArtist: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  headerBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  queueMoreBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
});
