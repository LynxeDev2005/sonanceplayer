import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  LayoutChangeEvent,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  interpolateColor,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";
import { triggerSelection } from "../utils/haptics";

export function GlassTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const [containerWidth, setContainerWidth] = useState(0);

  const routeCount = state.routes.length;
  const tabWidth = containerWidth > 0 ? containerWidth / routeCount : 0;

  // Reanimated shared value for the physical position of the sliding lens
  const slidePosition = useSharedValue(0);

  useEffect(() => {
    if (tabWidth > 0) {
      // Apple-tuned spring physics: snappy, slight overshoot, physical mass
      slidePosition.value = withSpring(state.index * tabWidth, {
        mass: 0.6,
        damping: 18,
        stiffness: 220,
      });
    }
  }, [state.index, tabWidth]);

  const onLayoutContent = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  };

  const animatedCapsuleStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: slidePosition.value }],
    };
  });

  return (
    <View
      style={[styles.outerContainer, { bottom: Math.max(insets.bottom, 12) }]}
    >
      {/*
        High-intensity blur with a highly transparent background.
        This forces the background content to do the visual work, creating true frosted glass.
      */}
      <BlurView intensity={75} tint="light" style={styles.blurCapsule}>
        <View style={styles.content} onLayout={onLayoutContent}>
          {/* Animated Sliding Liquid Glass Lens */}
          {tabWidth > 0 && (
            <Animated.View
              style={[
                styles.slidingCapsuleTrack,
                { width: tabWidth },
                animatedCapsuleStyle,
              ]}
              pointerEvents="none"
            >
              <View style={styles.liquidCapsulePill}>
                {/* 3D Specular Sheen for the sliding lens */}
                <LinearGradient
                  colors={[
                    "rgba(255, 255, 255, 0.95)",
                    "rgba(255, 255, 255, 0.4)",
                    "rgba(255, 255, 255, 0.8)",
                  ]}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                />
              </View>
            </Animated.View>
          )}

          {state.routes.map((route: any, index: number) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;

            const onPress = () => {
              triggerSelection();
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const Icon = options.tabBarIcon;

            // Tie icon animations physically to the sliding lens position
            const animatedIconStyle = useAnimatedStyle(() => {
              if (tabWidth === 0) return { transform: [{ scale: 1 }] };

              // The exact center position of this specific tab
              const tabCenterPos = index * tabWidth;

              // Magnify the icon as the lens passes over it (Liquid Magnification)
              const scale = interpolate(
                slidePosition.value,
                [
                  tabCenterPos - tabWidth,
                  tabCenterPos,
                  tabCenterPos + tabWidth,
                ],
                [0.85, 1.15, 0.85],
                Extrapolation.CLAMP,
              );

              // Fluid color transition matching the lens position
              const color = interpolateColor(
                slidePosition.value,
                [
                  tabCenterPos - tabWidth,
                  tabCenterPos,
                  tabCenterPos + tabWidth,
                ],
                ["#94A3B8", colors.tint || "#0284C7", "#94A3B8"],
              );

              return {
                transform: [{ scale }],
                // Note: We use a tintColor or pass it down via an animatable wrapper.
                // For direct SVG icon colors, we'll handle it below via Reanimated.
              };
            });

            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={onPress}
                style={styles.tabItem}
                activeOpacity={1} // Disable default opacity flash for a cleaner look
              >
                <Animated.View style={[styles.iconWrapper, animatedIconStyle]}>
                  {Icon &&
                    Icon({
                      focused: isFocused,
                      color: isFocused ? colors.tint || "#0284C7" : "#94A3B8",
                      size: 24, // Slightly larger base size for the scale down effect
                    })}
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: "absolute",
    left: 24,
    right: 24,
    alignItems: "center",

    // Ambient Occlusion Shadow (Soft, deeply spread)
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 8,
  },
  blurCapsule: {
    width: "100%",
    borderRadius: 36,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.3)", // Highly transparent for maximum frost

    // Pure glass edge reflections
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.9)",
    borderBottomColor: "rgba(255, 255, 255, 0.4)", // Dimmer bottom edge for 3D lighting
  },
  content: {
    flexDirection: "row",
    height: 64, // Slightly taller for breathing room
    alignItems: "center",
    position: "relative",
  },
  slidingCapsuleTrack: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 0,
  },
  liquidCapsulePill: {
    width: 52,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",

    // Specular glass borders
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 1)",
    borderBottomWidth: 0.5,

    // Refraction drop-shadow (bends light away from the pill)
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  tabItem: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
});
