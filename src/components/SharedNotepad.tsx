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

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { ThemeColors } from '../utils/theme';
import { useFamilyId } from '../hooks/useFamily';
import {
  SharedNoteItem,
  subscribeToSharedNotes,
  addSharedNote,
  toggleSharedNote,
  deleteSharedNote,
  clearDoneSharedNotes,
  setSharedNoteReaction,
  countDoneThisWeek,
  SHARED_NOTE_EMOJIS,
  SHARED_NOTE_REACTIONS,
} from '../services/sharedNotes';

export function SharedNotepad({ colors, isDark }: { colors: ThemeColors; isDark: boolean }) {
  const { settings, updateSettings } = useStore();
  const familyId = useFamilyId();
  const [items, setItems] = useState<SharedNoteItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftEmoji, setDraftEmoji] = useState<string | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);

  useEffect(() => {
    if (!familyId) return;
    const unsub = subscribeToSharedNotes(
      familyId,
      (next) => { setLoadError(false); setItems(next); },
      () => { setLoadError(true); setItems([]); }
    );
    return unsub;
  }, [familyId]);

  const myName = settings.myName?.trim() || null;
  const openCount = useMemo(() => (items ?? []).filter((i) => !i.done).length, [items]);
  const doneCount = useMemo(() => (items ?? []).filter((i) => i.done).length, [items]);
  // Liebevolle Wochenstatistik – "Wir als Team" statt nüchterner Zähler (TE-124).
  const doneThisWeek = useMemo(() => countDoneThisWeek(items ?? []), [items]);

  const handleSaveName = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    updateSettings({ myName: trimmed });
  }, [nameDraft, updateSettings]);

  const handleAdd = useCallback(async () => {
    const text = draft.trim();
    if (!text || !myName || !familyId) return;
    setDraft('');
    const emoji = draftEmoji;
    setDraftEmoji(null);
    try {
      await addSharedNote(familyId, text, myName, emoji);
    } catch {}
  }, [draft, myName, draftEmoji, familyId]);

  const handleReact = useCallback(async (item: SharedNoteItem, emoji: string) => {
    setReactionPickerFor(null);
    if (!myName || !familyId) return;
    try {
      // Erneutes Antippen derselben Reaktion entfernt sie wieder (Toggle).
      const next = item.reaction?.emoji === emoji && item.reaction?.by === myName
        ? null
        : { emoji, by: myName };
      await setSharedNoteReaction(familyId, item.id, next);
    } catch {}
  }, [myName, familyId]);

  const handleToggle = useCallback(async (item: SharedNoteItem) => {
    if (!familyId) return;
    setBusyId(item.id);
    try {
      await toggleSharedNote(familyId, item.id, !item.done);
    } finally {
      setBusyId(null);
    }
  }, [familyId]);

  const handleDelete = useCallback(async (item: SharedNoteItem) => {
    if (!familyId) return;
    setBusyId(item.id);
    try {
      await deleteSharedNote(familyId, item.id);
    } finally {
      setBusyId(null);
    }
  }, [familyId]);

  const handleClearDone = useCallback(async () => {
    if (!items || !familyId) return;
    await clearDoneSharedNotes(familyId, items);
  }, [items, familyId]);

  const accent = colors.accentNeon;
  const [tooltipVisible, setTooltipVisible] = useState(false);

  if (!familyId) return null;

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
        <Pressable
          onPress={() => setTooltipVisible((v) => !v)}
          style={styles.infoBtn}
          hitSlop={8}
        >
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      {tooltipVisible && (
        <Text style={[styles.tooltip, { backgroundColor: colors.surfaceAlt ?? colors.surface, color: colors.textMuted, borderColor: colors.border ?? colors.textMuted }]}>
          Für Dinge, die ihr gemeinsam im Blick behalten wollt – z. B. den Einkauf.
        </Text>
      )}

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
          {/* Sticker-Auswahl – macht neue Einträge auf den ersten Blick persönlicher (TE-124) */}
          <View style={styles.emojiRow}>
            {SHARED_NOTE_EMOJIS.map((e) => {
              const selected = draftEmoji === e;
              return (
                <Pressable
                  key={e}
                  onPress={() => setDraftEmoji(selected ? null : e)}
                  style={[
                    styles.emojiChip,
                    { borderColor: selected ? accent : colors.border, backgroundColor: selected ? accent + '22' : 'transparent' },
                  ]}
                  hitSlop={4}
                >
                  <Text style={styles.emojiChipText}>{e}</Text>
                </Pressable>
              );
            })}
          </View>

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
            <View>
              {items.map((item, i) => {
                const pickerOpen = reactionPickerFor === item.id;
                const reactedByMe = !!item.reaction && item.reaction.by === myName;
                return (
                <View key={item.id}>
                  <View
                    style={[styles.row, i < items.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
                  >
                    {/* Checkbox */}
                    <Pressable onPress={() => handleToggle(item)} hitSlop={8} disabled={busyId === item.id}>
                      <Ionicons
                        name={item.done ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={item.done ? colors.success : colors.textMuted}
                      />
                    </Pressable>

                    {/* Text + Meta */}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.itemText, { color: colors.text }, item.done && { textDecorationLine: 'line-through', color: colors.textMuted }]}
                        numberOfLines={2}
                      >
                        {item.emoji ? `${item.emoji} ` : ''}{item.text}
                      </Text>
                      <View style={styles.itemMetaRow}>
                        <Text style={[styles.itemMeta, { color: colors.textMuted }]}>von {item.addedBy}</Text>
                        {item.reaction && (
                          <View style={[styles.reactionBadge, { borderColor: reactedByMe ? accent : colors.border }]}>
                            <Text style={styles.reactionBadgeEmoji}>{item.reaction.emoji}</Text>
                            <Text style={[styles.reactionBadgeText, { color: colors.textMuted }]}>von {item.reaction.by}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Reaktion */}
                    <Pressable
                      onPress={() => myName && setReactionPickerFor(pickerOpen ? null : item.id)}
                      hitSlop={8}
                      disabled={!myName}
                      style={styles.heartBtn}
                    >
                      <Ionicons
                        name={item.reaction ? 'heart' : 'heart-outline'}
                        size={18}
                        color={item.reaction ? '#E8607A' : colors.textMuted}
                      />
                    </Pressable>

                    {/* Löschen */}
                    <Pressable
                      onPress={() => handleDelete(item)}
                      hitSlop={8}
                      disabled={busyId === item.id}
                      style={[styles.deleteBtn, { backgroundColor: colors.danger + '22' }]}
                    >
                      <Ionicons name="close" size={16} color={colors.danger} />
                    </Pressable>
                  </View>

                  {/* Reaktions-Picker unterhalb der Zeile */}
                  {pickerOpen && (
                    <View style={[styles.reactionPicker, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
                      {SHARED_NOTE_REACTIONS.map((r) => (
                        <Pressable key={r} onPress={() => handleReact(item, r)} hitSlop={6} style={styles.reactionPickerBtn}>
                          <Text style={styles.reactionPickerEmoji}>{r}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
                );
              })}
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

          {/* Liebevolle "Wir als Team"-Statistik statt nüchterner Zahlen (TE-124) */}
          {doneThisWeek > 0 && (
            <View style={[styles.loveStat, { borderColor: accent + '55', backgroundColor: accent + '14' }]}>
              <Text style={styles.loveStatEmoji}>💪❤️</Text>
              <Text style={[styles.loveStatText, { color: colors.text }]}>
                Ihr habt diese Woche {doneThisWeek} {doneThisWeek === 1 ? 'Ding' : 'Dinge'} gemeinsam erledigt
              </Text>
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
  infoBtn: { marginLeft: 'auto', padding: 2 },
  tooltip: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },

  namePrompt: { gap: 8, paddingTop: 4 },
  namePromptText: { fontSize: 12.5, lineHeight: 18 },
  nameRow: { flexDirection: 'row', gap: 8 },
  nameInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  saveNameBtn: { width: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  addRow: { flexDirection: 'row', gap: 8 },
  addInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  addBtn: { width: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Sticker-Auswahl beim Hinzufügen (TE-124)
  emojiRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  emojiChip: { minWidth: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  emojiChipText: { fontSize: 14 },

  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  emptyText: { fontSize: 13 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  deleteBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heartBtn: { padding: 2 },
  itemText: { fontSize: 14, fontWeight: '600' },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1, flexWrap: 'wrap' },
  itemMeta: { fontSize: 11 },

  // Reaktionen – das liebevolle "Anstupsen" auf einzelne Einträge (TE-124)
  reactionBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  reactionBadgeEmoji: { fontSize: 11 },
  reactionBadgeText: { fontSize: 10 },
  reactionPicker: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6, alignSelf: 'flex-start' },
  reactionPickerBtn: { padding: 2 },
  reactionPickerEmoji: { fontSize: 18 },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  footerText: { fontSize: 11.5 },
  footerAction: { fontSize: 12, fontWeight: '700' },

  // Liebevolle Wochenstatistik (TE-124)
  loveStat: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 2 },
  loveStatEmoji: { fontSize: 16 },
  loveStatText: { fontSize: 12, fontWeight: '600', flex: 1 },
});
