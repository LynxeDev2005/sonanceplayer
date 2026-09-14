import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Image,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";

import { colors, spacing, typography } from "../theme";
import { usePlaybackState } from "../player/hooks";
import { PlayerController } from "../player/PlayerController";
import { triggerLightImpact } from "../utils/haptics";

const handleStopPlayback = () => {
  PlayerController.stop();
};

const handleHaptic = () => {
  triggerLightImpact();
};

export function MiniPlayer() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { currentTrack, isPlaying, position, duration } = usePlaybackState();

  // 1. Initialize Reanimated Shared Values
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // 2. Define Animated Styles FIRST
  const animatedCardStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-width * 0.4, 0, width * 0.4],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );

    const scale = interpolate(
      translateY.value,
      [0, 100],
      [1, 0.85],
      Extrapolation.CLAMP,
    );

    return {
      opacity,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale },
      ],
    };
  });

  // 3. Define Gesture Physics
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      'worklet';
      translateX.value = e.translationX;
      translateY.value =
        e.translationY < 0 ? e.translationY * 0.15 : e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      const isHorizontalSwipe =
        Math.abs(e.translationX) > 70 || Math.abs(e.velocityX) > 600;
      const isDownSwipe = e.translationY > 50 || e.velocityY > 600;

      if (isHorizontalSwipe || isDownSwipe) {
        runOnJS(handleHaptic)();

        const targetX = isHorizontalSwipe
          ? Math.sign(e.translationX || e.velocityX) * (width + 50)
          : 0;
        const targetY = isDownSwipe ? 200 : 0;

        translateX.value = withTiming(targetX, { duration: 200 });
        translateY.value = withTiming(targetY, { duration: 200 }, (finished) => {
          'worklet';
          if (finished) {
            runOnJS(handleStopPlayback)();
            translateX.value = 0;
            translateY.value = 0;
          }
        });
      } else {
        translateX.value = withSpring(0, {
          mass: 0.6,
          damping: 18,
          stiffness: 220,
        });
        translateY.value = withSpring(0, {
          mass: 0.6,
          damping: 18,
          stiffness: 220,
        });
      }
    });

  // 4. NOW we can safely return early if there is no track
  if (!currentTrack) {
    return null;
  }

  // 5. Calculate remaining values
  const progress = (position ?? 0) / (duration ?? 1);
  const bottomPosition = Math.max(insets.bottom, 12) + 70;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.container,
          {
            bottom: bottomPosition,
            width: width - 32,
          },
          animatedCardStyle,
        ]}
      >
        <TouchableOpacity
          style={styles.touchableWrapper}
          activeOpacity={0.85}
          onPress={() => router.push("/player")}
        >
          <BlurView intensity={80} tint="light" style={styles.blurCard}>
            <View style={styles.content}>
              <View style={styles.artworkWrapper}>
                {currentTrack.artworkUrl ? (
                  <Image
                    source={{ uri: currentTrack.artworkUrl }}
                    style={styles.artwork}
                  />
                ) : (
                  <LinearGradient
                    colors={["#F1F5F9", "#E2E8F0"]}
                    style={styles.artworkPlaceholder}
                  >
                    <Ionicons
                      name="musical-note"
                      size={18}
                      color={colors.textSecondary}
                    />
                  </LinearGradient>
                )}
                <View style={styles.artworkGlassOverlay} />
              </View>

              <View style={styles.infoContainer}>
                <Text style={styles.title} numberOfLines={1}>
                  {currentTrack.title}
                </Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {currentTrack.artist}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.playButton}
                activeOpacity={0.6}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={(e) => {
                  e.stopPropagation();
                  triggerLightImpact();
                  PlayerController.togglePlayPause();
                }}
              >
                <LinearGradient
                  colors={[
                    "rgba(255, 255, 255, 0.9)",
                    "rgba(255, 255, 255, 0.3)",
                  ]}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <Ionicons
                  name={isPlaying ? "pause" : "play"}
                  size={16}
                  color={colors.text}
                  style={isPlaying ? {} : { marginLeft: 2 }}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, Math.max(0, progress * 100))}%` },
                ]}
              />
            </View>
          </BlurView>
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  touchableWrapper: {
    borderRadius: 24,
    overflow: "hidden",
  },
  blurCard: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.45)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 1)",
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255, 255, 255, 0.5)",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  artworkWrapper: {
    width: 46,
    height: 46,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  artworkGlassOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 16,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  artworkPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  infoContainer: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: "center",
  },
  title: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  artist: {
    fontSize: typography.sizes.sm,
    color: "#64748B",
    marginTop: 1,
    fontWeight: "500",
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    marginLeft: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.9)",
    borderBottomColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.tint || "#0284C7",
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    shadowColor: colors.tint || "#0284C7",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
});
