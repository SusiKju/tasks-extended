/**
 * SharedNotepad.tsx (TE-121)
 *
 * Geteilte Liste fürs Dashboard – z. B. eine gemeinsame Einkaufsliste, die
 * beide Elternteile in Echtzeit befüllen und abhaken können (Firestore-
 * Backend, siehe services/sharedNotes.ts).
 *
 * Bewusst ANDERS als der private Scratchpad gestaltet: statt freier
 * Notiz-Bubbles eine klassische Häkchen-Liste mit Eingabezeile, Autor-Tag
 * pro Eintrag ("von Matthias") und einem auffälligen, farbig umrandeten
 * Card-Look, der den Abschnitt bewusst hervorhebt.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { ThemeColors } from '../utils/theme';
import {
  SharedNoteItem,
  subscribeToSharedNotes,
  addSharedNote,
  toggleSharedNote,
  deleteSharedNote,
  clearDoneSharedNotes,
} from '../services/sharedNotes';

export function SharedNotepad({ colors, isDark }: { colors: ThemeColors; isDark: boolean }) {
  const { settings, updateSettings } = useStore();
  const [items, setItems] = useState<SharedNoteItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToSharedNotes(
      (next) => { setLoadError(false); setItems(next); },
      () => { setLoadError(true); setItems([]); }
    );
    return unsub;
  }, []);

  const myName = settings.myName?.trim() || null;
  const openCount = useMemo(() => (items ?? []).filter((i) => !i.done).length, [items]);
  const doneCount = useMemo(() => (items ?? []).filter((i) => i.done).length, [items]);

  const handleSaveName = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    updateSettings({ myName: trimmed });
  }, [nameDraft, updateSettings]);

  const handleAdd = useCallback(async () => {
    const text = draft.trim();
    if (!text || !myName) return;
    setDraft('');
    try {
      await addSharedNote(text, myName);
    } catch {}
  }, [draft, myName]);

  const handleToggle = useCallback(async (item: SharedNoteItem) => {
    setBusyId(item.id);
    try {
      await toggleSharedNote(item.id, !item.done);
    } finally {
      setBusyId(null);
    }
  }, []);

  const handleDelete = useCallback(async (item: SharedNoteItem) => {
    setBusyId(item.id);
    try {
      await deleteSharedNote(item.id);
    } finally {
      setBusyId(null);
    }
  }, []);

  const handleClearDone = useCallback(async () => {
    if (!items) return;
    await clearDoneSharedNotes(items);
  }, [items]);

  const accent = colors.accentNeon;

  return (
    <View style={[styles.wrap, { borderColor: accent, backgroundColor: colors.surface, shadowColor: accent }]}>
      {/* Auffälliger Header mit Icon-Badge – hebt den Abschnitt bewusst hervor (TE-121) */}
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: accent }]}>
          <Ionicons name="cart-outline" size={15} color={isDark ? '#000' : '#fff'} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Geteilte Liste</Text>
        <View style={[styles.sharedTag, { borderColor: accent }]}>
          <Ionicons name="people-outline" size={12} color={accent} />
          <Text style={[styles.sharedTagText, { color: accent }]}>geteilt</Text>
        </View>
      </View>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Für Dinge, die ihr gemeinsam im Blick behalten wollt – z. B. den Einkauf.
      </Text>

      {!myName ? (
        // Einmaliger Mini-Dialog: Name festlegen, damit Einträge zugeordnet werden können.
        <View style={styles.namePrompt}>
          <Text style={[styles.namePromptText, { color: colors.textSecondary }]}>
            Wie heißt du? So sehen beide, von wem ein Eintrag stammt.
          </Text>
          <View style={styles.nameRow}>
            <TextInput
              style={[styles.nameInput, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
              placeholder="z. B. Matthias"
              placeholderTextColor={colors.placeholder}
              value={nameDraft}
              onChangeText={setNameDraft}
              onSubmitEditing={handleSaveName}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.saveNameBtn, { backgroundColor: accent, opacity: nameDraft.trim() ? 1 : 0.4 }]}
              onPress={handleSaveName}
              disabled={!nameDraft.trim()}
            >
              <Ionicons name="checkmark" size={18} color={isDark ? '#000' : '#fff'} />
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {/* Eingabezeile */}
          <View style={styles.addRow}>
            <TextInput
              style={[styles.addInput, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
              placeholder="Eintrag hinzufügen …"
              placeholderTextColor={colors.placeholder}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={handleAdd}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.addBtn, { backgroundColor: accent, opacity: draft.trim() ? 1 : 0.4 }]}
              onPress={handleAdd}
              disabled={!draft.trim()}
            >
              <Ionicons name="add" size={20} color={isDark ? '#000' : '#fff'} />
            </Pressable>
          </View>

          {loadError ? (
            <View style={styles.emptyRow}>
              <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
              <Text style={[styles.emptyText, { color: colors.danger }]}>
                Liste kann nicht geladen werden – fehlende Firestore-Berechtigung für „shared". Bitte Regeln in der Firebase-Konsole ergänzen.
              </Text>
            </View>
          ) : items === null ? (
            <ActivityIndicator color={accent} style={{ marginVertical: 14 }} />
          ) : items.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="cart-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Noch leer – fügt etwas hinzu.</Text>
            </View>
          ) : (
            <View style={{ gap: 2 }}>
              {items.map((item, i) => (
                <View
                  key={item.id}
                  style={[styles.row, i < items.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
                >
                  <Pressable onPress={() => handleToggle(item)} hitSlop={8} disabled={busyId === item.id}>
                    <Ionicons
                      name={item.done ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={item.done ? colors.success : colors.textMuted}
                    />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.itemText, { color: colors.text }, item.done && { textDecorationLine: 'line-through', color: colors.textMuted }]}
                      numberOfLines={2}
                    >
                      {item.text}
                    </Text>
                    <Text style={[styles.itemMeta, { color: colors.textMuted }]}>von {item.addedBy}</Text>
                  </View>
                  <Pressable onPress={() => handleDelete(item)} hitSlop={8} disabled={busyId === item.id}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {(openCount > 0 || doneCount > 0) && (
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: colors.textMuted }]}>
                {openCount} offen · {doneCount} erledigt
              </Text>
              {doneCount > 0 && (
                <Pressable onPress={handleClearDone} hitSlop={8}>
                  <Text style={[styles.footerAction, { color: accent }]}>Erledigtes löschen</Text>
                </Pressable>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 8,
    // Dezenter, farbiger Glow – hebt den Abschnitt hervor, ohne zu animieren (TE-121).
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', flex: 1 },
  sharedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  sharedTagText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  subtitle: { fontSize: 12, marginTop: -2 },

  namePrompt: { gap: 8, paddingTop: 4 },
  namePromptText: { fontSize: 12.5, lineHeight: 18 },
  nameRow: { flexDirection: 'row', gap: 8 },
  nameInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  saveNameBtn: { width: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  addRow: { flexDirection: 'row', gap: 8 },
  addInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  addBtn: { width: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  emptyText: { fontSize: 13 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  itemText: { fontSize: 14, fontWeight: '600' },
  itemMeta: { fontSize: 11, marginTop: 1 },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  footerText: { fontSize: 11.5 },
  footerAction: { fontSize: 12, fontWeight: '700' },
});
