import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors } from '../src/theme';
import { useEffect, useState } from 'react';
import { initDatabase } from '../src/data/database';
import { initStorage } from '../src/data/storage';
import { initializePlayer } from '../modules/sonance-audio/src';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function setup() {
      try {
        initDatabase();
        await initStorage();
        initializePlayer();
      } catch (e) {
        console.error("Initialization error:", e);
      } finally {
        setIsReady(true);
      }
    }
    setup();
  }, []);

  if (!isReady) {
    return null; // Or a splash screen
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="player" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="import" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="equalizer" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
