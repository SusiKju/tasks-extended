/**
 * BambiniScreen.tsx
 *
 * Tab "Bambini" (TE-18): zentrale Pflege der Kinder (Name + Geburtsjahr).
 * Aus dieser Registry speisen sich die jahrgangsweise gefilterten Ansichten
 * in den Fußball-Notizen (FussballKachel). Beim ersten Öffnen werden alte
 * Roster-Namen automatisch hierher migriert.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeColors } from '../utils/theme';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import {
  Child,
  loadBambini,
  saveBambini,
  migrateRosterToBambini,
} from '../services/bambini';

/** Alert funktioniert auf Web nicht — window.confirm als Fallback. */
function confirmDelete(name: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`„${name}" löschen?`)) onConfirm();
  } else {
    Alert.alert('Löschen', `„${name}" löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: onConfirm },
    ]);
  }
}

export function BambiniScreen() {
  const { colors } = useTheme();
  const { user } = useFirebaseAuth();
  const uid = user?.uid ?? '';
  const s = makeStyles(colors);

  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal-State: editing === null → zu; mit Child → bearbeiten; mit '' id → neu.
  const [editing, setEditing] = useState<Child | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [yearInput, setYearInput] = useState('');

  const reload = useCallback(async () => {
    if (!uid) {
      setChildren([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await migrateRosterToBambini(uid);
      setChildren(await loadBambini(uid));
    } catch (e) {
      console.warn('Bambini laden fehlgeschlagen', e);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    reload();
  }, [reload]);

  const persist = useCallback(
    (next: Child[]) => {
      setChildren(next);
      if (uid) saveBambini(uid, next).catch((e) => console.warn('Bambini speichern fehlgeschlagen', e));
    },
    [uid],
  );

  const openNew = () => {
    setEditing({ id: '', name: '', birthYear: 0 });
    setNameInput('');
    setYearInput('');
  };

  const openEdit = (c: Child) => {
    setEditing(c);
    setNameInput(c.name);
    setYearInput(c.birthYear ? String(c.birthYear) : '');
  };

  const closeModal = () => setEditing(null);

  const saveEntry = () => {
    const name = nameInput.trim();
    if (!name) {
      closeModal();
      return;
    }
    const year = Number(yearInput);
    const birthYear = Number.isFinite(year) && year > 1900 ? Math.trunc(year) : 0;

    if (editing && editing.id) {
      persist(children.map((c) => (c.id === editing.id ? { ...c, name, birthYear } : c)));
    } else {
      persist([...children, { id: '', name, birthYear }]);
    }
    closeModal();
  };

  const removeEntry = (c: Child) => {
    confirmDelete(c.name, () => persist(children.filter((x) => x.id !== c.id)));
  };

  // Nach Jahrgang gruppieren (children kommen bereits sortiert).
  const groups: { year: number; items: Child[] }[] = [];
  children.forEach((c) => {
    const g = groups.find((x) => x.year === c.birthYear);
    if (g) g.items.push(c);
    else groups.push({ year: c.birthYear, items: [c] });
  });

  return (
    <View style={s.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          {children.length === 0 ? (
            <Text style={s.empty}>Noch keine Kinder. Mit „+" anlegen.</Text>
          ) : (
            groups.map((g) => (
              <View key={g.year} style={s.group}>
                <Text style={s.groupTitle}>{g.year ? `Jahrgang ${g.year}` : 'Ohne Jahrgang'}</Text>
                {g.items.map((c) => (
                  <Pressable key={c.id} style={s.row} onPress={() => openEdit(c)}>
                    <Text style={s.rowName}>{c.name}</Text>
                    <Text style={s.rowYear}>{c.birthYear || '—'}</Text>
                    <Pressable onPress={() => removeEntry(c)} hitSlop={8} style={s.rowDel} accessibilityLabel="Löschen">
                      <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Pressable style={s.fab} onPress={openNew} accessibilityLabel="Kind hinzufügen">
        <Ionicons name="add" size={28} color={colors.accentFg} />
      </Pressable>

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.card}>
            <Text style={s.cardTitle}>{editing?.id ? 'Kind bearbeiten' : 'Neues Kind'}</Text>
            <TextInput
              style={s.input}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Name"
              placeholderTextColor={colors.placeholder}
              autoFocus
            />
            <TextInput
              style={s.input}
              value={yearInput}
              onChangeText={(t) => setYearInput(t.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="Geburtsjahr (z. B. 2019)"
              placeholderTextColor={colors.placeholder}
              keyboardType="number-pad"
              maxLength={4}
            />
            <View style={s.cardActions}>
              <Pressable onPress={closeModal} style={[s.btn, s.btnGhost]}>
                <Text style={[s.btnText, { color: colors.textSecondary }]}>Abbrechen</Text>
              </Pressable>
              <Pressable onPress={saveEntry} style={[s.btn, { backgroundColor: colors.accent }]}>
                <Text style={[s.btnText, { color: colors.accentFg }]}>Speichern</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { padding: 12, paddingBottom: 96 },
    empty: { color: c.textSecondary, textAlign: 'center', marginTop: 40, fontSize: 14 },

    group: { marginBottom: 16 },
    groupTitle: { color: c.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 6,
    },
    rowName: { flex: 1, color: c.text, fontSize: 15, fontWeight: '600' },
    rowYear: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
    rowDel: { padding: 2 },

    fab: {
      position: 'absolute',
      right: 18,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 6,
    },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 360, backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 18, gap: 12 },
    cardTitle: { color: c.text, fontSize: 17, fontWeight: '700' },
    input: {
      backgroundColor: c.inputBackground,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: c.text,
      fontSize: 15,
    },
    cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
    btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
    btnGhost: { borderWidth: 1, borderColor: c.border },
    btnText: { fontSize: 15, fontWeight: '600' },
  });
}
