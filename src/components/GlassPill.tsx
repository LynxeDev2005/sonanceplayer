import React from 'react';
import { Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, typography, radii } from '../theme';

export interface GlassPillProps {
  label: string;
  isActive?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
}

export function GlassPill({ label, isActive, style, onPress }: GlassPillProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={[styles.container, style]}>
      <BlurView 
        intensity={isActive ? 90 : 60} 
        tint="light" 
        style={[styles.blur, isActive && styles.activeBlur]}
      >
        <Text style={[styles.text, isActive && styles.activeText]}>{label}</Text>
      </BlurView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.round,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  blur: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radii.round,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  activeBlur: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  text: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  activeText: {
    color: colors.white,
    fontWeight: '700',
  }
});
