/**
 * FamilySetupScreen.tsx
 *
 * Erscheint nach dem Login, wenn der User noch keiner Familie angehört.
 * Zwei Optionen: Neue Familie erstellen oder mit Wort-Paar-Code beitreten.
 */

import React, { useState, useCallback, useEffect } from 'react';
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
import { useRouter } from 'expo-router';
import { getCurrentUser } from '../services/firebaseAuth';
import {
  createFamily, requestToJoinFamily, subscribeToJoinRequest,
  cancelJoinRequest, completeJoin, saveUserFamilyLink,
} from '../services/family';

export function FamilySetupScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'choose' | 'create' | 'join' | 'pending'>('choose');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingFamilyId, setPendingFamilyId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const user = getCurrentUser();
    if (!user) {
      Alert.alert('Nicht angemeldet', 'Bitte lade die Seite neu und melde dich erneut an.');
      return;
    }
    setLoading(true);
    try {
      const familyId = await createFamily(user);
      await saveUserFamilyLink(user.uid, familyId);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      Alert.alert('Fehler', e?.message ?? 'Familie konnte nicht erstellt werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleJoin = useCallback(async () => {
    const user = getCurrentUser();
    if (!code.trim()) return;
    if (!user) {
      Alert.alert('Nicht angemeldet', 'Bitte lade die Seite neu und melde dich erneut an.');
      return;
    }
    setLoading(true);
    try {
      const familyId = await requestToJoinFamily(user, code.trim());
      setPendingFamilyId(familyId);
      setMode('pending');
    } catch (e: any) {
      Alert.alert('Unbekannter Code', e?.message ?? 'Bitte Schreibweise prüfen.');
    } finally {
      setLoading(false);
    }
  }, [code]);

  // TE-59: Beitritt braucht seit dem Sicherheitsaudit die Bestätigung eines
  // bestehenden Mitglieds. Solange die Anfrage offen ist, hier warten und
  // live auf Bestätigung/Ablehnung reagieren.
  useEffect(() => {
    if (mode !== 'pending' || !pendingFamilyId) return;
    const user = getCurrentUser();
    if (!user) return;
    return subscribeToJoinRequest(pendingFamilyId, user.uid, async (request) => {
      if (request === null) {
        Alert.alert('Anfrage abgelehnt', 'Dein Beitritt wurde nicht bestätigt.');
        setMode('choose');
        setPendingFamilyId(null);
        return;
      }
      if (request.approved) {
        try {
          await completeJoin(user, pendingFamilyId);
          await saveUserFamilyLink(user.uid, pendingFamilyId);
          router.replace('/(tabs)/dashboard');
        } catch (e: any) {
          Alert.alert('Fehler', e?.message ?? 'Beitritt konnte nicht abgeschlossen werden.');
        }
      }
    });
  }, [mode, pendingFamilyId]);

  const handleCancelRequest = useCallback(async () => {
    const user = getCurrentUser();
    if (!user || !pendingFamilyId) return;
    try {
      await cancelJoinRequest(pendingFamilyId, user.uid);
    } catch {
      // Anfrage evtl. schon bestätigt/gelöscht – egal, UI geht trotzdem zurück
    }
    setPendingFamilyId(null);
    setMode('choose');
  }, [pendingFamilyId]);

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

      {/* ── Warten auf Bestätigung (TE-59) ── */}
      {mode === 'pending' && (
        <View style={styles.inner}>
          <ActivityIndicator size="large" color="#4F7EF5" />
          <Text style={styles.title}>Warte auf Bestätigung</Text>
          <Text style={styles.subtitle}>
            Ein bestehendes Mitglied der Familie muss deinen Beitritt bestätigen. Das dauert nur einen Moment.
          </Text>

          <Pressable onPress={handleCancelRequest} style={styles.backBtn}>
            <Text style={styles.backText}>Anfrage zurückziehen</Text>
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
