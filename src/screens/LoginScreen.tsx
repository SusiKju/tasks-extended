/**
 * LoginScreen.tsx
 *
 * Erster Screen – erscheint wenn kein Firebase-User eingeloggt ist.
 * Zeigt einen "Mit Google anmelden"-Button.
 *
 * Web:    signInWithPopup (Firebase Popup-Flow)
 * Native: bestehender PKCE-Flow aus googleCalendar.ts + Firebase signInWithCredential
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithFirebase } from '../services/firebaseAuth';
import { signInWithGoogle } from '../services/googleCalendar';
import { useStore } from '../store';

export function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const { updateSettings } = useStore();

  const handleLogin = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        // Web: Firebase Popup übernimmt alles
        await signInWithFirebase();
        // Google-Kalender-Token separat holen (für Tasks/Kalender/Mail)
        const calAuth = await signInWithGoogle();
        if (calAuth) {
          updateSettings({
            googleAccessToken: calAuth.accessToken,
            googleRefreshToken: calAuth.refreshToken ?? undefined,
            googleTokenExpiry: calAuth.expiresIn
              ? Date.now() + calAuth.expiresIn * 1000
              : undefined,
          });
        }
      } else {
        // Native: PKCE-Flow liefert idToken + accessToken für Firebase + Kalender
        const calAuth = await signInWithGoogle();
        if (!calAuth) throw new Error('Google-Login abgebrochen.');
        if (!calAuth.idToken) {
          throw new Error('Kein ID-Token erhalten. Bitte openid-Scope prüfen.');
        }
        await signInWithFirebase({
          idToken: calAuth.idToken,
          accessToken: calAuth.accessToken,
        });
        updateSettings({
          googleAccessToken: calAuth.accessToken,
          googleRefreshToken: calAuth.refreshToken ?? undefined,
          googleTokenExpiry: calAuth.expiresIn
            ? Date.now() + calAuth.expiresIn * 1000
            : undefined,
        });
      }
      // Navigation übernimmt der Auth-Guard in _layout.tsx
    } catch (e: any) {
      Alert.alert('Anmeldung fehlgeschlagen', e?.message ?? 'Unbekannter Fehler.');
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
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
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

      <Text style={styles.hint}>
        Deine Daten sind nur für deine Familie sichtbar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F0F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 24,
  },
  logo: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F7EF5',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 28,
    width: '100%',
    maxWidth: 320,
  },
  btnPressed: { opacity: 0.75 },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    color: '#AEAEB2',
    textAlign: 'center',
    maxWidth: 280,
  },
});
