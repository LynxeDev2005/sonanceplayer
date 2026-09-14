import React from "react";
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { colors, typography, radii } from "../theme";

export interface GlassPillProps {
  label: string;
  isActive?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
}

const IS_ANDROID = Platform.OS === "android";

export function GlassPill({ label, isActive, style, onPress }: GlassPillProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.container, isActive && styles.activeContainer, style]}
    >
      {/* Translucent fill — shows through the blur, creating depth */}
      <View
        style={[
          styles.fill,
          isActive ? styles.activeFill : styles.inactiveFill,
        ]}
        pointerEvents="none"
      />
      <BlurView
        intensity={isActive ? 70 : 50}
        tint="light"
        blurMethod="dimezisBlurView" // smoother blur on Android
        style={StyleSheet.absoluteFill}
      >
        {/* Specular top highlight for that glossy edge */}
        <View style={styles.innerHighlight} pointerEvents="none" />
        <Text style={[styles.text, isActive && styles.activeText]}>
          {label}
        </Text>
      </BlurView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.round,
    overflow: "hidden",
    alignSelf: "flex-start",
    // Soft ambient shadow — light glass floats, it doesn't drop heavy shadows
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  activeContainer: {
    shadowOpacity: 0.16,
  },
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Nearly invisible fill — the blur does the work
  inactiveFill: {
    backgroundColor: IS_ANDROID
      ? "rgba(255,255,255,0.45)"
      : "rgba(255,255,255,0.12)",
  },
  // Dark glass when active, still translucent
  activeFill: {
    backgroundColor: IS_ANDROID ? "#0F172A" : "rgba(15,23,42,0.82)",
  },
  innerHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "55%",
    borderTopLeftRadius: radii.round,
    borderTopRightRadius: radii.round,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    // Gradient-ish fade using opacity trickery — avoids extra deps
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  text: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: "600",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  activeText: {
    color: colors.white,
    fontWeight: "700",
  },
});
