/**
 * GoogleConnectBanner.tsx
 *
 * Erscheint auf dem Dashboard wenn der Nutzer noch keinen Google-Kalender
 * verbunden hat. Der Button ist ein direkter User-Gesture und der GIS-Token-
 * Client wird beim Modul-Load vorgeladen (googleCalendar.ts) → requestAccessToken
 * läuft synchron im Gesture und das Popup öffnet zuverlässig.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../utils/theme';
import { signInWithGoogle, listCalendars } from '../services/googleCalendar';
import { useStore } from '../store';

export function GoogleConnectBanner({ colors }: { colors: ThemeColors }) {
  const [loading, setLoading] = useState(false);
  const { updateSettings } = useStore();

  const handleConnect = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const calAuth = await signInWithGoogle();
      if (!calAuth) {
        Alert.alert('Verbindung fehlgeschlagen', 'Google-Login abgebrochen.');
        return;
      }
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
    } catch (e: any) {
      Alert.alert('Fehler', e?.message ?? 'Verbindung fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }, [loading, updateSettings]);

  return (
    <View style={[styles.banner, { backgroundColor: '#4F7EF5' + '18', borderColor: '#4F7EF5' + '55' }]}>
      <Ionicons name="sync-outline" size={20} color="#4F7EF5" style={{ flexShrink: 0 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>Kalender & Aufgaben verbinden</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Einmal verbinden um Kalender, Aufgaben und Notizen zu synchronisieren.
        </Text>
      </View>
      <Pressable
        onPress={handleConnect}
        disabled={loading}
        style={({ pressed }) => [styles.btn, { opacity: pressed || loading ? 0.7 : 1 }]}
      >
        {loading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={styles.btnText}>Verbinden</Text>
        }
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 4,
    marginTop: 2,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 1 },
  subtitle: { fontSize: 11.5, lineHeight: 16 },
  btn: {
    backgroundColor: '#4F7EF5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
