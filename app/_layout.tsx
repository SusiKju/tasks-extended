import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform, View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../src/utils/theme';
import { useStore } from '../src/store';
import { useGoogleTasksSync } from '../src/hooks/useGoogleTasksSync';
import { useGoogleContactsBirthdaysSync } from '../src/hooks/useGoogleContactsBirthdaysSync';
import { getValidAccessToken } from '../src/services/googleCalendar';
import { scheduleCheckIfNeeded, stopScheduledPush } from '../src/services/scheduledPush';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFirebaseAuth } from '../src/hooks/useFirebaseAuth';
import { useFamily } from '../src/hooks/useFamily';
import { useSettingsSync } from '../src/hooks/useSettingsSync';
import { useMailPinsSync } from '../src/hooks/useMailPinsSync';
import { handleRedirectResult } from '../src/services/firebaseAuth';
import { AppContextProvider } from '../src/contexts/AppContext';

export default function RootLayout() {
  const { colors, isDark } = useTheme();

  // Auf GitHub Pages: Firebase Redirect-Ergebnis beim App-Start auswerten.
  // onAuthStateChanged feuert danach automatisch – hier nur Fehler abfangen.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    handleRedirectResult().catch((e) => {
      console.error('[Firebase Redirect] Fehler:', e?.code, e?.message);
    });
  }, []);
  const { syncTasks } = useGoogleTasksSync();
  const { syncBirthdays } = useGoogleContactsBirthdaysSync();
  const { settings, updateSettings } = useStore();

  // ── Auth-Guard ──────────────────────────────────────────────────────────────
  const router = useRouter();
  const segments = useSegments();
  const { user, loading: authLoading } = useFirebaseAuth();
  const { familyId, children: familyChildren, loading: familyLoading } = useFamily();

  // TE-49: App-Settings geräteübergreifend mit Firestore synchronisieren.
  useSettingsSync();
  // TE-50: Angepinnte E-Mails geräteübergreifend mit Firestore synchronisieren.
  useMailPinsSync();
  const syncTasksRef = useRef(syncTasks);
  syncTasksRef.current = syncTasks;
  const syncBirthdaysRef = useRef(syncBirthdays);
  syncBirthdaysRef.current = syncBirthdays;
  const syncRef = syncTasksRef;
  const lastSyncAt = useRef(0);

  useEffect(() => {
    // Nur syncen wenn User eingeloggt und Familie geladen – verhindert GIS-Popup auf Login-Seite
    if (!user || !familyId) return;

    const runSync = () => {
      syncRef.current().catch(() => {});
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
          getValidAccessToken().catch(() => null).then(() => {
            syncRef.current().catch(() => {});
            syncBirthdaysRef.current().catch(() => {});
          });
        }
      }
    };

    const sub = AppState.addEventListener('change', onStateChange);

    const keepAlive = setInterval(() => {
      getValidAccessToken().catch(() => {});
    }, 4 * 60_000);

    return () => {
      sub.remove();
      clearInterval(keepAlive);
      stopScheduledPush();
    };
  }, [user, familyId, settings.googleAccessToken]);

  // myName aus Firebase-DisplayName vorbelegen, falls noch nicht gesetzt
  useEffect(() => {
    if (!user) return;
    if (!settings.myName?.trim()) {
      const firstName = user.displayName?.split(' ')[0] ?? null;
      if (firstName) updateSettings({ myName: firstName });
    }
  }, [user]);

  // Kinder-Modus-Flag (TE-74): Gerät als Kinder-Gerät eingerichtet (kinder_child_id
  // gesetzt)? Wird bei jeder Navigation neu gelesen – deckt Einrichten (Schlüssel
  // gesetzt → '/') und PIN-Ausstieg (Schlüssel entfernt → Eltern-Modus) ab.
  // null = noch nicht geladen.
  const [isChildMode, setIsChildMode] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem('kinder_child_id').then((id) => setIsChildMode(!!id));
  }, [segments]);

  // Auth-Guard: Weiterleitung per useEffect statt <Redirect> (vermeidet Endlosschleife)
  useEffect(() => {
    if (authLoading || familyLoading || isChildMode === null) return;
    const inAuth = segments[0] === 'login' || segments[0] === 'family-setup';
    if (!user) {
      // Auch im Kinder-Modus: ohne Session muss sich ein Elternteil anmelden.
      // Nach dem Login greift der Mitglied-Zweig unten und führt zurück nach '/'.
      if (!inAuth) router.replace('/login');
    } else if (!familyId) {
      // Eingeloggt, aber (noch) kein Familienmitglied. Kinder-Gerät bleibt im
      // Kinder-Modus statt im Eltern-Family-Setup zu landen (TE-74).
      if (isChildMode) {
        if (segments[0]) router.replace('/');
      } else if (segments[0] !== 'family-setup') {
        router.replace('/family-setup');
      }
    } else {
      // Eingeloggtes Familienmitglied. Kinder-Gerät bleibt im Kinder-Modus ('/'),
      // Eltern-Gerät geht aufs Dashboard. TE-74: vorher landete auch das
      // Kinder-Gerät nach dem Login kurz auf dem Dashboard und musste über einen
      // separaten, fragilen Guard zurückgebounced werden – Ursache der „leeren
      // Seite ohne Aufgaben". Jetzt routet der Guard direkt richtig.
      if (isChildMode) {
        if (segments[0]) router.replace('/');
      } else if (inAuth) {
        router.replace('/(tabs)/dashboard');
      }
    }
  }, [user, familyId, authLoading, familyLoading, isChildMode, segments]);

  // Kinder-Geräte-Guard (TE-64) ist seit TE-74 in den Auth-Guard oben gefaltet:
  // dort führt der Mitglied-Zweig im Kinder-Modus direkt nach '/', sodass kein
  // separater, nur-Web Async-Bounce über AsyncStorage mehr nötig (und fehleranfällig) ist.

  // Scheduled Push im Eltern-Modus starten sobald familyId + Kinder bekannt sind
  useEffect(() => {
    if (!familyId || familyChildren.length === 0) return;
    AsyncStorage.getItem('kinder_child_id').then((childId) => {
      if (!childId) scheduleCheckIfNeeded(familyId, familyChildren);
    });
    return () => stopScheduledPush();
  }, [familyId, familyChildren]);

  // Während Auth/Family/Kinder-Modus noch laden: Spinner zeigen
  if (authLoading || familyLoading || isChildMode === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F0F5' }}>
        <ActivityIndicator size="large" color="#4F7EF5" />
      </View>
    );
  }

  return (
    <AppContextProvider value={{ user, familyId }}>
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
    </AppContextProvider>
  );
}
