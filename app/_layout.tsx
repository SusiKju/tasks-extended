import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform, View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../src/utils/theme';
import { useStore } from '../src/store';
import { useGoogleTasksSync } from '../src/hooks/useGoogleTasksSync';
import { useGoogleDriveNotesSync } from '../src/hooks/useGoogleDriveNotesSync';
import { useGoogleContactsBirthdaysSync } from '../src/hooks/useGoogleContactsBirthdaysSync';
import { getValidAccessToken } from '../src/services/googleCalendar';
import { scheduleCheckIfNeeded, stopScheduledPush } from '../src/services/scheduledPush';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFirebaseAuth } from '../src/hooks/useFirebaseAuth';
import { useFamily } from '../src/hooks/useFamily';

export default function RootLayout() {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark-neon';
  const { syncTasks } = useGoogleTasksSync();
  const { syncDriveNotes } = useGoogleDriveNotesSync();
  const { syncBirthdays } = useGoogleContactsBirthdaysSync();

  // ── Auth-Guard ──────────────────────────────────────────────────────────────
  const router = useRouter();
  const segments = useSegments();
  const { user, loading: authLoading } = useFirebaseAuth();
  const { familyId, children: familyChildren, loading: familyLoading } = useFamily();
  const syncTasksRef = useRef(syncTasks);
  syncTasksRef.current = syncTasks;
  const syncNotesRef = useRef(syncDriveNotes);
  syncNotesRef.current = syncDriveNotes;
  const syncBirthdaysRef = useRef(syncBirthdays);
  syncBirthdaysRef.current = syncBirthdays;
  const syncRef = syncTasksRef;
  const lastSyncAt = useRef(0);

  useEffect(() => {
    // Warten bis der Store aus AsyncStorage geladen ist, dann erst syncen
    const runSync = () => {
      syncRef.current().catch(() => {});
      syncNotesRef.current().catch(() => {});
      syncBirthdaysRef.current().catch(() => {});
    };

    const state = useStore.getState();
    if (state._hydrated) {
      runSync();
    } else {
      const unsub = useStore.subscribe((s) => {
        if (s._hydrated) {
          unsub();
          runSync();
        }
      });
    }

    const onStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const now = Date.now();
        if (now - lastSyncAt.current > 60_000) {
          lastSyncAt.current = now;
          // Beim Zurückkommen Token still auffrischen, dann syncen.
          getValidAccessToken().catch(() => null).then(() => {
            syncRef.current().catch(() => {});
            syncNotesRef.current().catch(() => {});
            syncBirthdaysRef.current().catch(() => {});
          });
        }
      }
    };

    const sub = AppState.addEventListener('change', onStateChange);

    // Token im Hintergrund am Leben halten: getValidAccessToken erneuert nur,
    // wenn das Token in <5 min abläuft. 4-min-Intervall fängt das rechtzeitig ab,
    // sodass der Web-Login nicht nach 1 h stirbt.
    const keepAlive = setInterval(() => {
      getValidAccessToken().catch(() => {});
    }, 4 * 60_000);

    // Scheduled Push: wird jetzt familien-abhängig gestartet (siehe useEffect unten)

    return () => {
      sub.remove();
      clearInterval(keepAlive);
      stopScheduledPush();
    };
  }, []);

  // Auth-Guard: Weiterleitung per useEffect statt <Redirect> (vermeidet Endlosschleife)
  useEffect(() => {
    if (authLoading || familyLoading) return;
    const inAuth = segments[0] === 'login' || segments[0] === 'family-setup';
    if (!user) {
      if (!inAuth) router.replace('/login');
    } else if (!familyId) {
      if (segments[0] !== 'family-setup') router.replace('/family-setup');
    } else {
      if (inAuth) router.replace('/(tabs)');
    }
  }, [user, familyId, authLoading, familyLoading]);

  // Scheduled Push im Eltern-Modus starten sobald familyId + Kinder bekannt sind
  useEffect(() => {
    if (!familyId || familyChildren.length === 0) return;
    AsyncStorage.getItem('kinder_child_id').then((childId) => {
      if (!childId) scheduleCheckIfNeeded(familyId, familyChildren);
    });
    return () => stopScheduledPush();
  }, [familyId, familyChildren]);

  // Während Auth/Family noch laden: Spinner zeigen
  if (authLoading || familyLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F0F5' }}>
        <ActivityIndicator size="large" color="#4F7EF5" />
      </View>
    );
  }

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
          <link rel="manifest" href="/tasks-extended/manifest.json" />
          <link rel="apple-touch-icon" href="/tasks-extended/icons/icon-192x192.png" />
        </Head>
      )}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="family-setup" options={{ headerShown: false }} />
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
