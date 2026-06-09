/**
 * LoginScreen.tsx – einfacher Single-Step Firebase-Login.
 * Die Google-Kalender-Verbindung (GIS) erfolgt danach im Dashboard-Banner.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithFirebase } from '../services/firebaseAuth';
import { signInWithGoogle, listCalendars } from '../services/googleCalendar';
import { useStore } from '../store';

export function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const { updateSettings } = useStore();

  const handleLogin = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        await signInWithFirebase();
        // Navigation übernimmt der Auth-Guard; GIS-Connect läuft im Dashboard-Banner
      } else {
        const calAuth = await signInWithGoogle();
        if (!calAuth) throw new Error('Google-Login abgebrochen.');
        if (!calAuth.idToken) throw new Error('Kein ID-Token erhalten.');
        await signInWithFirebase({ idToken: calAuth.idToken, accessToken: calAuth.accessToken });
        const calendars = await listCalendars(calAuth.accessToken).catch(() => []);
        const primary = calendars.find((c) => c.primary) ?? calendars[0] ?? null;
        updateSettings({
          googleAccessToken: calAuth.accessToken,
          googleRefreshToken: calAuth.refreshToken ?? undefined,
          googleTokenExpiry: calAuth.expiresIn ? Date.now() + calAuth.expiresIn * 1000 : undefined,
          googleCalendarEnabled: true,
          googleCalendarId: primary?.id ?? null,
          googleCalendarName: primary?.summary ?? null,
          googleNotesEnabled: true,
          googleBirthdaysEnabled: true,
        });
      }
    } catch (e: any) {
      const msg = e?.code ? `${e.code}\n${e.message ?? ''}` : (e?.message ?? 'Unbekannter Fehler.');
      console.error('[Login] Fehler:', e?.code, e?.message);
      Alert.alert('Anmeldung fehlgeschlagen', msg);
    } finally {
      setLoading(false);
    }
  }, [loading, updateSettings]);

  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <Ionicons name="people-circle-outline" size={72} color="#4F7EF5" />
        <Text style={styles.appName}>Familien-App</Text>
        <Text style={styles.tagline}>Dein geteilter Familienbereich</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, loading && { opacity: 0.5 }]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="logo-google" size={20} color="#fff" style={{ marginRight: 10 }} />
            <Text style={styles.btnText}>Mit Google anmelden</Text>
          </>
        )}
      </Pressable>

      <Text style={styles.hint}>Deine Daten sind nur für deine Familie sichtbar.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#F0F0F5', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 32, gap: 24,
  },
  logo: { alignItems: 'center', gap: 8, marginBottom: 16 },
  appName: { fontSize: 28, fontWeight: '800', color: '#1C1C1E', letterSpacing: -0.5 },
  tagline: { fontSize: 15, color: '#8E8E93', textAlign: 'center' },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#4F7EF5', borderRadius: 14, paddingVertical: 16,
    paddingHorizontal: 28, width: '100%', maxWidth: 320,
  },
  btnPressed: { opacity: 0.75 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13, color: '#AEAEB2', textAlign: 'center', maxWidth: 280 },
});
