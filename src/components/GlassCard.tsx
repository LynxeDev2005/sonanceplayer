import React from "react";
import { View, ViewProps, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";

export interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
}

const IS_ANDROID = Platform.OS === "android";

export function GlassCard({ children, style, ...props }: GlassCardProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {/* Translucent fill behind the blur for depth / Android fallback */}
      <View style={styles.fill} pointerEvents="none" />
      <BlurView
        intensity={55}
        tint="light"
        blurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      >
        {/* Specular top highlight */}
        <View style={styles.innerHighlight} pointerEvents="none" />
        {children}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: IS_ANDROID
      ? "rgba(255,255,255,0.45)"
      : "rgba(255,255,255,0.10)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 4,
  },
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  innerHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
});
