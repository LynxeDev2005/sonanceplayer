import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PressableProps,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { colors, typography, spacing, animations } from "../theme";

export interface GlassButtonProps extends PressableProps {
  title: string;
  style?: any;
}

export const GlassButton = React.forwardRef<View, GlassButtonProps>(
  ({ title, style, ...props }, ref) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <Animated.View style={[animatedStyle, style]}>
        <Pressable
          ref={ref}
          style={styles.button}
          onPressIn={() => (scale.value = withSpring(0.96, animations.spring))}
          onPressOut={() => (scale.value = withSpring(1, animations.spring))}
          {...props}
        >
          <View style={styles.fill} pointerEvents="none" />
          <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill}>
            <View style={styles.innerHighlight} pointerEvents="none" />
            <Text style={styles.text}>{title}</Text>
          </BlurView>
        </Pressable>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  button: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
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
    height: "55%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  text: {
    color: colors.text,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    textAlign: "center",
  },
});
