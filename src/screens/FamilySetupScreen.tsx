/**
 * FamilySetupScreen.tsx
 *
 * Erscheint nach dem Login, wenn der User noch keiner Familie angehört.
 * Zwei Optionen: Neue Familie erstellen oder mit Wort-Paar-Code beitreten.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentUser } from '../services/firebaseAuth';
import { createFamily, joinFamilyWithCode, saveUserFamilyLink } from '../services/family';

export function FamilySetupScreen() {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = useCallback(async () => {
    const user = getCurrentUser();
    if (!user) return;
    setLoading(true);
    try {
      const familyId = await createFamily(user);
      await saveUserFamilyLink(user.uid, familyId);
      // Navigation übernimmt der Auth-Guard in _layout.tsx (re-render nach saveUserFamilyLink)
    } catch (e: any) {
      Alert.alert('Fehler', e?.message ?? 'Familie konnte nicht erstellt werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleJoin = useCallback(async () => {
    const user = getCurrentUser();
    if (!user || !code.trim()) return;
    setLoading(true);
    try {
      const familyId = await joinFamilyWithCode(user, code.trim());
      await saveUserFamilyLink(user.uid, familyId);
    } catch (e: any) {
      Alert.alert('Unbekannter Code', e?.message ?? 'Bitte Schreibweise prüfen.');
    } finally {
      setLoading(false);
    }
  }, [code]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Auswahl ── */}
      {mode === 'choose' && (
        <View style={styles.inner}>
          <Ionicons name="people-circle-outline" size={64} color="#4F7EF5" />
          <Text style={styles.title}>Deine Familie</Text>
          <Text style={styles.subtitle}>
            Erstelle einen neuen Familienbereich oder tritt einer bestehenden Familie bei.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
            onPress={() => setMode('create')}
          >
            <Ionicons name="add-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.btnText}>Neue Familie erstellen</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && styles.btnPressed]}
            onPress={() => setMode('join')}
          >
            <Ionicons name="enter-outline" size={20} color="#4F7EF5" style={{ marginRight: 8 }} />
            <Text style={[styles.btnText, { color: '#4F7EF5' }]}>Mit Familiencode beitreten</Text>
          </Pressable>
        </View>
      )}

      {/* ── Neue Familie erstellen ── */}
      {mode === 'create' && (
        <View style={styles.inner}>
          <Ionicons name="home-outline" size={56} color="#4F7EF5" />
          <Text style={styles.title}>Neue Familie</Text>
          <Text style={styles.subtitle}>
            Ein einzigartiger Familiencode wird für dich generiert. Teile ihn mit deinem Partner, damit er beitreten kann.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.btnText}>Familie erstellen</Text>
            }
          </Pressable>

          <Pressable onPress={() => setMode('choose')} style={styles.backBtn}>
            <Text style={styles.backText}>← Zurück</Text>
          </Pressable>
        </View>
      )}

      {/* ── Beitreten ── */}
      {mode === 'join' && (
        <View style={styles.inner}>
          <Ionicons name="key-outline" size={56} color="#4F7EF5" />
          <Text style={styles.title}>Familie beitreten</Text>
          <Text style={styles.subtitle}>
            Gib den Familiencode ein, den dein Partner dir gegeben hat (z. B. „blauer-apfel").
          </Text>

          <TextInput
            style={styles.input}
            placeholder="z. B. blauer-apfel"
            placeholderTextColor="#AEAEB2"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleJoin}
          />

          <Pressable
            style={({ pressed }) => [
              styles.btn, styles.btnPrimary,
              pressed && styles.btnPressed,
              !code.trim() && styles.btnDisabled,
            ]}
            onPress={handleJoin}
            disabled={loading || !code.trim()}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.btnText}>Beitreten</Text>
            }
          </Pressable>

          <Pressable onPress={() => setMode('choose')} style={styles.backBtn}>
            <Text style={styles.backText}>← Zurück</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F0F5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  inner: {
    alignItems: 'center',
    gap: 16,
    width: '100%',
    maxWidth: 360,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 24,
    width: '100%',
    marginTop: 4,
  },
  btnPrimary: { backgroundColor: '#4F7EF5' },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#4F7EF5',
  },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { opacity: 0.7 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  input: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E8',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: '#1C1C1E',
    textAlign: 'center',
    letterSpacing: 1,
  },
  backBtn: { marginTop: 4, padding: 8 },
  backText: { fontSize: 14, color: '#8E8E93' },
});
