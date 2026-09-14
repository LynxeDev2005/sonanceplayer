import React, { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

export interface MilkyWaveformRipplesProps {
  isPlaying?: boolean;
  intensity?: "off" | "subtle" | "expressive";
  centerX?: number;
  centerY?: number;
}

export interface LiquidBackgroundProps {
  children?: React.ReactNode;
  style?: ViewStyle;
  blurIntensity?: number;
  showCaustics?: boolean;
  showRipples?: boolean;
  isPlaying?: boolean;
  rippleIntensity?: "off" | "subtle" | "expressive";
  rippleCenterX?: number;
  rippleCenterY?: number;
}

/**
 * LiquidBackground - iOS Glass Optimized
 *
 * Tuned for pure light mode, frosted glass refraction, and
 * physically accurate fluid dynamics.
 */
export function LiquidBackground({
  children,
  style,
  blurIntensity = 85, // High blur to create the thick frosted glass base
  showCaustics = true,
  showRipples = false,
  isPlaying = false,
  rippleIntensity = "expressive",
  rippleCenterX,
  rippleCenterY,
}: LiquidBackgroundProps) {
  const { width, height } = useWindowDimensions();

  // 1. Organic Breathing Pulse (8.5s sinusoidal loop)
  const fluidBreath = useSharedValue(0);

  // 2. Primary Liquid Refraction Orb (11s - 13.5s harmonic drift)
  const orb1X = useSharedValue(0);
  const orb1Y = useSharedValue(0);

  // 3. Secondary Counter-Drift Orb (14s - 16s celestial counter-rotation)
  const orb2X = useSharedValue(0);
  const orb2Y = useSharedValue(0);

  // 4. Water Surface Caustic Shimmer (6.0s wave)
  const waterSheen = useSharedValue(0);

  useEffect(() => {
    // Fluid Breath
    fluidBreath.value = withRepeat(
      withTiming(1, { duration: 8500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );

    // Primary Orb - Smooth, endless drift
    orb1X.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 11000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 13000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    orb1Y.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 13500, easing: Easing.inOut(Easing.quad) }),
        withTiming(-1, { duration: 11500, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );

    // Secondary Orb - Counter drift
    orb2X.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    orb2Y.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 15500, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 12500, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );

    // Caustic Sheen (Light rays shifting)
    waterSheen.value = withRepeat(
      withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);

  const animatedOrb1Style = useAnimatedStyle(() => {
    const translateX = interpolate(
      orb1X.value,
      [-1, 1],
      [-width * 0.25, width * 0.25],
    );
    const translateY = interpolate(
      orb1Y.value,
      [-1, 1],
      [-height * 0.18, height * 0.18],
    );
    const scale = interpolate(fluidBreath.value, [0, 1], [0.92, 1.15]);
    return { transform: [{ translateX }, { translateY }, { scale }] };
  });

  const animatedOrb2Style = useAnimatedStyle(() => {
    const translateX = interpolate(
      orb2X.value,
      [-1, 1],
      [width * 0.22, -width * 0.22],
    );
    const translateY = interpolate(
      orb2Y.value,
      [-1, 1],
      [height * 0.15, -height * 0.15],
    );
    const scale = interpolate(fluidBreath.value, [0, 1], [1.12, 0.95]);
    return { transform: [{ translateX }, { translateY }, { scale }] };
  });

  const animatedCausticStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      waterSheen.value,
      [0, 0.5, 1],
      [0.1, 0.35, 0.1],
    );
    const translateY = interpolate(waterSheen.value, [0, 1], [-15, 15]);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  return (
    <View style={[styles.container, style]}>
      {/* Base Ultra-Clean Canvas */}
      <LinearGradient
        colors={["#FFFFFF", "#F8FAFC", "#E2E8F0"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Layer 1: Sky/Water Hybrid Orb */}
      <Animated.View style={[styles.orb1Container, animatedOrb1Style]}>
        <LinearGradient
          colors={[
            "rgba(125, 211, 252, 0.5)",
            "rgba(224, 242, 254, 0.3)",
            "transparent",
          ]}
          style={styles.orbShape}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {/* Layer 2: Iridescent Lilac Orb */}
      <Animated.View style={[styles.orb2Container, animatedOrb2Style]}>
        <LinearGradient
          colors={[
            "rgba(216, 180, 254, 0.4)",
            "rgba(244, 207, 250, 0.25)",
            "transparent",
          ]}
          style={styles.orbShape}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      </Animated.View>

      {/* Layer 3: Caustic Light Shimmer (Behind the blur for organic blending) */}
      {showCaustics && (
        <Animated.View style={[styles.causticLayer, animatedCausticStyle]}>
          <LinearGradient
            colors={[
              "transparent",
              "rgba(255, 255, 255, 0.8)",
              "rgba(224, 242, 254, 0.3)",
              "transparent",
            ]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.7 }}
          />
        </Animated.View>
      )}

      {/* Layer 4: Apple Native Hardware Diffusion (Frosted Glass) */}
      <BlurView
        intensity={blurIntensity}
        tint="light"
        style={StyleSheet.absoluteFill}
      />

      {/* Layer 5: Concentric Milky Liquid Wave Ripples */}
      {showRipples && (
        <MilkyWaveformRipples
          isPlaying={isPlaying}
          intensity={rippleIntensity}
          centerX={rippleCenterX}
          centerY={rippleCenterY}
        />
      )}

      {/* Layer 6: Specular Top Screen Highlight (Edge Glint) */}
      <LinearGradient
        colors={["rgba(255, 255, 255, 0.7)", "rgba(255, 255, 255, 0.0)"]}
        style={styles.specularTopRim}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Foreground Content */}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// WAVE RING COMPONENT
// ---------------------------------------------------------------------------

interface SingleWaveRingProps {
  index: number;
  total: number;
  durationMs: number;
  delayMs: number;
  activeVal: SharedValue<number>;
  maxRadius: number;
}

function SingleWaveRing({
  durationMs,
  delayMs,
  activeVal,
  maxRadius,
}: SingleWaveRingProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Reset before starting to ensure clean stagger on re-renders
    progress.value = 0;
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withTiming(1, {
          duration: durationMs,
          // Custom Bezier: Fast initial burst, highly sustained smooth glide (Water physics)
          easing: Easing.bezier(0.16, 1.0, 0.3, 1.0),
        }),
        -1,
        false,
      ),
    );
  }, [delayMs, durationMs]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const active = activeVal.value;

    // Expand much larger so it seamlessly dissipates into the horizon
    const scale = interpolate(p, [0, 1], [0.05, 4.0]);

    // Opacity: Sharp impact birth (0 to 1 instantly), then a long, elegant fade
    const opacity =
      interpolate(p, [0, 0.05, 0.15, 0.7, 1], [0, 1, 0.8, 0.05, 0]) * active;

    // Dynamic crest: Starts visible, sharpens to hairlineWidth, then vanishes
    const borderWidth = interpolate(p, [0, 0.1, 0.8, 1], [3.0, 1.5, 0.5, 0]);

    return {
      opacity,
      borderWidth,
      transform: [{ scale }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.waveRing,
        {
          width: maxRadius,
          height: maxRadius,
          borderRadius: maxRadius / 2,
          marginLeft: -maxRadius / 2,
          marginTop: -maxRadius / 2,
        },
        animatedStyle,
      ]}
    >
      {/* Specular Liquid Glint Arc - creates the "glassy" 3D sheen */}
      <LinearGradient
        colors={[
          "rgba(255, 255, 255, 0.9)",
          "rgba(255, 255, 255, 0.1)",
          "rgba(255, 255, 255, 0.0)",
        ]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.7, y: 0.7 }}
      />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// RIPPLE ENGINE
// ---------------------------------------------------------------------------

export function MilkyWaveformRipples({
  isPlaying = true,
  intensity = "expressive",
  centerX,
  centerY,
}: MilkyWaveformRipplesProps) {
  const { width, height } = useWindowDimensions();

  const activeVal = useSharedValue(
    isPlaying && intensity !== "off"
      ? intensity === "expressive"
        ? 1.0
        : 0.5
      : 0,
  );
  const corePulse = useSharedValue(0);

  useEffect(() => {
    const target =
      isPlaying && intensity !== "off"
        ? intensity === "expressive"
          ? 1.0
          : 0.5
        : 0;
    activeVal.value = withTiming(target, {
      duration: 1000,
      easing: Easing.out(Easing.cubic),
    });
  }, [isPlaying, intensity]);

  useEffect(() => {
    // Gentle surface tension breathing at the origin point
    corePulse.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);

  if (intensity === "off") return null;

  const posX = centerX !== undefined ? centerX : width / 2;
  const posY = centerY !== undefined ? centerY : height * 0.4;
  const baseDiameter = Math.min(width, height) * 0.9;

  const animatedCoreStyle = useAnimatedStyle(() => {
    const scale = interpolate(corePulse.value, [0, 1], [0.95, 1.1]);
    const opacity =
      interpolate(corePulse.value, [0, 1], [0.3, 0.8]) * activeVal.value;
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  // Tighter duration and 5 wavefronts for a more connected, realistic ripple sequence
  const WAVE_COUNT = 5;
  const DURATION_MS = 4800;
  const DELAY_STEP_MS = DURATION_MS / WAVE_COUNT;

  return (
    <View
      style={[styles.ripplesContainer, { left: posX, top: posY }]}
      pointerEvents="none"
    >
      {/* Central Disturbance Origin (Soft Frosted Core) */}
      <Animated.View
        style={[
          styles.dropletCore,
          {
            width: baseDiameter * 0.45,
            height: baseDiameter * 0.45,
            borderRadius: (baseDiameter * 0.45) / 2,
            marginLeft: -(baseDiameter * 0.45) / 2,
            marginTop: -(baseDiameter * 0.45) / 2,
          },
          animatedCoreStyle,
        ]}
      >
        <LinearGradient
          colors={[
            "rgba(255, 255, 255, 0.95)",
            "rgba(241, 245, 249, 0.4)",
            "transparent",
          ]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.3, y: 0.3 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {/* Expanding Refraction Rings */}
      {Array.from({ length: WAVE_COUNT }).map((_, index) => (
        <SingleWaveRing
          key={`wave-${index}`}
          index={index}
          total={WAVE_COUNT}
          durationMs={DURATION_MS}
          delayMs={index * DELAY_STEP_MS}
          activeVal={activeVal}
          maxRadius={baseDiameter}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#F8FAFC",
  },
  orb1Container: {
    position: "absolute",
    top: "5%",
    left: "5%",
    width: 380,
    height: 380,
  },
  orb2Container: {
    position: "absolute",
    bottom: "10%",
    right: "-5%",
    width: 420,
    height: 420,
  },
  orbShape: {
    width: "100%",
    height: "100%",
    borderRadius: 210,
  },
  causticLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1, // Keep behind blur for realistic dispersion
  },
  specularTopRim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    pointerEvents: "none",
    zIndex: 10,
  },
  ripplesContainer: {
    position: "absolute",
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5, // Above BlurView
  },
  dropletCore: {
    position: "absolute",
    overflow: "hidden",
    shadowColor: "#000", // Subtle light bending
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
  },
  waveRing: {
    position: "absolute",
    borderColor: "rgba(255, 255, 255, 1)", // Pure white crest
    backgroundColor: "rgba(255, 255, 255, 0.02)", // Subtle surface tension body
    overflow: "hidden",

    // This shadow acts as the "refracted edge" bending light downward (iOS glass trick)
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
});
