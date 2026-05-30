import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../src/utils/theme';
import { useGoogleTasksSync } from '../src/hooks/useGoogleTasksSync';

export default function RootLayout() {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark-neon';
  const { syncTasks } = useGoogleTasksSync();
  const syncRef = useRef(syncTasks);
  syncRef.current = syncTasks;
  const lastSyncAt = useRef(0);

  useEffect(() => {
    syncRef.current().catch(() => {});

    const onStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const now = Date.now();
        if (now - lastSyncAt.current > 60_000) {
          lastSyncAt.current = now;
          syncRef.current().catch(() => {});
        }
      }
    };

    const sub = AppState.addEventListener('change', onStateChange);
    return () => sub.remove();
  }, []);

  return (
    <>
      {Platform.OS === 'web' && (
        <Head>
          <meta name="application-name" content="TasksExtended" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="Tasks" />
          <meta name="theme-color" content="#4F7EF5" />
          <meta name="mobile-web-app-capable" content="yes" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        </Head>
      )}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="task/new"
          options={{
            title: 'Neuer Task',
            presentation: 'modal',
            headerStyle: { backgroundColor: colors.header },
            headerTintColor: colors.accent,
            headerTitleStyle: { color: colors.text },
          }}
        />
        <Stack.Screen
          name="task/[id]"
          options={{
            title: '',
            headerStyle: { backgroundColor: colors.header },
            headerTintColor: colors.accent,
            headerBackTitle: 'Zurück',
          }}
        />
      </Stack>
    </>
  );
}
