import React from 'react';
import { View, Text, StyleSheet, Pressable, PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { materials, colors, typography, spacing, animations } from '../theme';

export interface GlassButtonProps extends PressableProps {
  title: string;
  style?: any;
}

export const GlassButton = React.forwardRef<View, GlassButtonProps>(({ title, style, ...props }, ref) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable 
        ref={ref}
        style={styles.button}
        onPressIn={() => scale.value = withSpring(0.95, animations.spring)}
        onPressOut={() => scale.value = withSpring(1, animations.spring)}
        {...props}
      >
        <Text style={styles.text}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  button: {
    ...materials.glass,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.text,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
