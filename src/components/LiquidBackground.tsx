import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

export interface LiquidBackgroundProps {
  children?: React.ReactNode;
  style?: ViewStyle;
  blurIntensity?: number;
  showCaustics?: boolean;
}

/**
 * LiquidBackground
 * 
 * 4-Oscillator Multi-Harmonic Fluid Engine:
 * 1. fluidBreath (8.5s sinusoidal breathing pulse)
 * 2. orbFloat1 (11.0s - 13.5s primary harmonic liquid refraction orb)
 * 3. orbFloat2 (14.0s - 16.0s celestial counter-drift liquid orb)
 * 4. waterSheen (6.0s caustic shimmer wave)
 * 
 * Tuned for Pure Light Mode crystal clear liquid glass refraction.
 */
export function LiquidBackground({
  children,
  style,
  blurIntensity = 85,
  showCaustics = true,
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
    // 1. Fluid Breath
    fluidBreath.value = withRepeat(
      withTiming(1, { duration: 8500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );

    // 2. Primary Orb
    orb1X.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 11000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 13000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    orb1Y.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 13500, easing: Easing.inOut(Easing.quad) }),
        withTiming(-1, { duration: 11500, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );

    // 3. Secondary Orb
    orb2X.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    orb2Y.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 15500, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 12500, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );

    // 4. Water Caustic Sheen
    waterSheen.value = withRepeat(
      withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, []);

  // Animated Styles (Hardware-composited on UI thread)
  const animatedOrb1Style = useAnimatedStyle(() => {
    const translateX = interpolate(orb1X.value, [-1, 1], [-width * 0.22, width * 0.22]);
    const translateY = interpolate(orb1Y.value, [-1, 1], [-height * 0.15, height * 0.15]);
    const scale = interpolate(fluidBreath.value, [0, 1], [0.95, 1.2]);
    return {
      transform: [{ translateX }, { translateY }, { scale }],
    };
  });

  const animatedOrb2Style = useAnimatedStyle(() => {
    const translateX = interpolate(orb2X.value, [-1, 1], [width * 0.2, -width * 0.2]);
    const translateY = interpolate(orb2Y.value, [-1, 1], [height * 0.12, -height * 0.12]);
    const scale = interpolate(fluidBreath.value, [0, 1], [1.15, 0.9]);
    return {
      transform: [{ translateX }, { translateY }, { scale }],
    };
  });

  const animatedCausticStyle = useAnimatedStyle(() => {
    const opacity = interpolate(waterSheen.value, [0, 0.5, 1], [0.15, 0.45, 0.15]);
    const translateY = interpolate(waterSheen.value, [0, 1], [-20, 20]);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  return (
    <View style={[styles.container, style]}>
      {/* Base Light Mode Foundation */}
      <LinearGradient
        colors={['#FFFFFF', '#F8FAFC', '#E2E8F0']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Layer 1: Primary Harmonic Fluid Orb (Soft Sky Blue & Ice Mint) */}
      <Animated.View style={[styles.orb1Container, animatedOrb1Style]}>
        <LinearGradient
          colors={['rgba(147, 197, 253, 0.55)', 'rgba(165, 243, 252, 0.35)', 'transparent']}
          style={styles.orbShape}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
        />
      </Animated.View>

      {/* Layer 2: Secondary Harmonic Fluid Orb (Soft Lavender & Rose Mist) */}
      <Animated.View style={[styles.orb2Container, animatedOrb2Style]}>
        <LinearGradient
          colors={['rgba(196, 181, 253, 0.45)', 'rgba(251, 207, 232, 0.30)', 'transparent']}
          style={styles.orbShape}
          start={{ x: 0.8, y: 0.2 }}
          end={{ x: 0.2, y: 0.8 }}
        />
      </Animated.View>

      {/* Layer 3: Caustic Shimmer Surface Wave */}
      {showCaustics && (
        <Animated.View style={[styles.causticLayer, animatedCausticStyle]}>
          <LinearGradient
            colors={[
              'transparent',
              'rgba(255, 255, 255, 0.65)',
              'rgba(224, 242, 254, 0.40)',
              'transparent',
            ]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.8 }}
          />
        </Animated.View>
      )}

      {/* Layer 4: Apple Native GPU Diffusion & Refraction (BlurView) */}
      <BlurView
        intensity={blurIntensity}
        tint="light"
        style={StyleSheet.absoluteFill}
      />

      {/* Specular Top Rim Highlight */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.85)', 'rgba(255, 255, 255, 0.0)']}
        style={styles.specularTopRim}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Content Layer */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  orb1Container: {
    position: 'absolute',
    top: '10%',
    left: '10%',
    width: 320,
    height: 320,
  },
  orb2Container: {
    position: 'absolute',
    bottom: '15%',
    right: '5%',
    width: 360,
    height: 360,
  },
  orbShape: {
    width: '100%',
    height: '100%',
    borderRadius: 180,
  },
  causticLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  specularTopRim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    pointerEvents: 'none',
  },
});
