/**
 * IdeasSection.tsx (TE-3)
 *
 * „Ideen" im Tasks-Tab – ersetzt den früheren Notizen-Bereich (schnelle +
 * komplexe Notizen). Bewusst ein simples Item-System: nur Text. Daten liegen
 * weiter in quickNotesByUser (siehe quickNotesService).
 *
 * Idee → Aufgabe: `onToTask(text)` legt die Aufgabe an, danach wird die Idee
 * gelöscht. Die Gegenrichtung (Aufgabe → Idee) sitzt im Scratchpad.
 *
 * Einmal-Migration: noch vorhandene komplexe Notizen (personalNotesByUser)
 * werden als Text-Idee übernommen (gleiche Doc-ID → idempotent, auch wenn
 * zwei Geräte gleichzeitig migrieren) und danach gelöscht.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Note, QuickNote } from '../types';
import { useTheme, neonGlow } from '../utils/theme';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useFamily } from '../hooks/useFamily';
import { subscribeToQuickNotes, addQuickNote, deleteQuickNote } from '../services/quickNotesService';
import { subscribeToPersonalNotes, deletePersonalNote } from '../services/personalNotesService';

/** Komplexe Notiz → reiner Text (Titel, Inhalt, Checkliste als ☐/☑-Zeilen). */
export function noteToText(n: Pick<Note, 'title' | 'content' | 'checklist'>): string {
  return [
    n.title?.trim(),
    n.content?.trim(),
    ...(n.checklist ?? []).map((i) => `${i.checked ? '☑' : '☐'} ${i.text}`),
  ].filter(Boolean).join('\n');
}

function showError(err: any) {
  Alert.alert('Fehler beim Speichern', err?.message ?? String(err));
}

export function IdeasSection({ onToTask }: { onToTask: (text: string) => void }) {
  const { colors, isDark } = useTheme();
  const { user } = useFirebaseAuth();
  const { familyId } = useFamily();
  const uid = user?.uid;
  const [ideas, setIdeas] = useState<QuickNote[]>([]);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!familyId || !uid) return;
    return subscribeToQuickNotes(familyId, uid, setIdeas);
  }, [familyId, uid]);

  // TE-3: Einmal-Migration der alten komplexen Notizen. Erst schreiben, dann
  // löschen – schlägt das Schreiben fehl, bleibt die Notiz erhalten.
  useEffect(() => {
    if (!familyId || !uid) return;
    return subscribeToPersonalNotes(familyId, uid, (notes) => {
      notes.forEach((n) => {
        const text = noteToText(n);
        const write = text
          ? addQuickNote(familyId, uid, text, { id: n.id, createdAt: n.createdAt })
          : Promise.resolve('');
        write.then(() => deletePersonalNote(familyId, uid, n.id)).catch(() => {});
      });
    });
  }, [familyId, uid]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || !familyId || !uid) return;
    addQuickNote(familyId, uid, text).catch(showError);
    setDraft('');
  }, [draft, familyId, uid]);

  const remove = useCallback((idea: QuickNote) => {
    if (!familyId || !uid) return;
    deleteQuickNote(familyId, uid, idea.id).catch(showError);
  }, [familyId, uid]);

  const toTask = useCallback((idea: QuickNote) => {
    onToTask(idea.text);
    remove(idea);
  }, [onToTask, remove]);

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[s.header, { borderBottomColor: colors.border, backgroundColor: colors.surfaceHigh }]}>
        <Ionicons name="bulb-outline" size={18} color={colors.text} />
        <Text style={[s.title, { color: colors.text }]}>Ideen</Text>
        <Pressable
          onPress={() => inputRef.current?.focus()}
          style={[
            s.addBtn,
            {
              backgroundColor: isDark ? 'transparent' : colors.accent,
              borderWidth: isDark ? 1.5 : 0,
              borderColor: colors.accentNeon,
            },
            isDark ? neonGlow(colors.accentNeon, 'hard') : null,
          ]}
          hitSlop={4}
          accessibilityLabel="Idee anlegen"
        >
          <Ionicons name="add" size={26} color={isDark ? colors.accentNeon : '#fff'} />
        </Pressable>
      </View>

      <View style={s.body}>
        <View style={[s.list, { borderColor: colors.border }]}>
          <View style={[s.row, ideas.length > 0 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Ionicons name="add" size={18} color={colors.textSecondary} />
            <TextInput
              ref={inputRef}
              style={[s.input, { color: colors.text }]}
              value={draft}
              onChangeText={setDraft}
              placeholder="Neue Idee…"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={submit}
              returnKeyType="done"
              blurOnSubmit={false}
            />
            {draft.trim() ? (
              <Pressable onPress={submit} hitSlop={8}>
                <Text style={[s.save, { color: colors.accent }]}>Sichern</Text>
              </Pressable>
            ) : null}
          </View>

          {ideas.map((idea, i) => (
            <View
              key={idea.id}
              style={[s.row, i < ideas.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <Ionicons name="bulb-outline" size={16} color={colors.textMuted} />
              <Text style={[s.text, { color: colors.text }]}>{idea.text}</Text>
              <Pressable onPress={() => toTask(idea)} hitSlop={8} style={s.icon} accessibilityLabel="In Aufgabe umwandeln">
                <Ionicons name="checkbox-outline" size={18} color={colors.textMuted} />
              </Pressable>
              <Pressable onPress={() => remove(idea)} hitSlop={8} style={s.icon} accessibilityLabel="Idee löschen">
                <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Gleicher Box-Look wie die Google-Tasks-/Aufgaben-Card im Tasks-Tab.
  card: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 2,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  title: { fontSize: 16, fontWeight: '700', flex: 1 },
  addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 12 },
  list: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10 },
  input: { flex: 1, fontSize: 14, padding: 0 },
  save: { fontSize: 14, fontWeight: '600' },
  text: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 18 },
  icon: { padding: 2, flexShrink: 0 },
});
