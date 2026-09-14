import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { materials } from '../theme';

export interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
}

export function GlassCard({ children, style, ...props }: GlassCardProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...materials.glass,
    overflow: 'hidden',
  },
});
