/**
 * FuerUnsScreen.tsx (TE-55)
 *
 * "Für uns": private tägliche Wertschätzungsnachrichten zwischen den Eltern.
 * Freier Text ohne Pflicht-Kategorie (Placeholder inspiriert: Liebevolles,
 * Erotisches, Gedanken, Lob – ein Kritikpunkt nur ganz sanft angedeutet).
 * Eine gemeinsame chronologische Liste (neueste zuerst), Emoji-Reaction und
 * Soft-Delete/Bearbeiten wie bei der geteilten Liste (sharedNotes.ts).
 *
 * Ungelesene Nachrichten vom Partner werden beim Öffnen als Momentaufnahme
 * fett markiert und gleichzeitig in Firestore als gelesen vermerkt – der
 * Tab-Badge verschwindet dadurch sofort, die Fett-Markierung bleibt für
 * diesen Screen-Besuch bestehen (kein Nachzucken während des Lesens).
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useStore } from '../store';
import { useTheme } from '../utils/theme';
import {
  FuerUnsItem,
  addFuerUnsMessage,
  setFuerUnsReaction,
  updateFuerUnsMessage,
  deleteFuerUnsMessage,
  restoreFuerUnsMessage,
  permanentlyDeleteFuerUnsMessage,
  markFuerUnsRead,
  FUER_UNS_REACTIONS,
  FUER_UNS_REACTIONS_EXTRA,
  FUER_UNS_COMBOS,
} from '../services/fuerUns';
import { useFuerUns } from '../hooks/useFuerUns';

function formatDateTime(iso: string): string {
  return format(parseISO(iso), 'dd.MM.yyyy, HH:mm');
}

const PLACEHOLDER =
  'Was möchtest du deinem Partner heute sagen? Etwas Liebes, etwas Erotisches, ' +
  'ein Gedanke – oder auch mal ganz sanft etwas, das ihr zusammen noch besser machen könntet.';

export function FuerUnsScreen() {
  const { colors, isDark } = useTheme();
  const { settings, updateSettings } = useStore();
  const { familyId, myName, items, deletedItems, loadError, loaded, unreadIds } = useFuerUns();

  // Momentaufnahme: welche Nachrichten waren beim Betreten des Screens ungelesen.
  // Läuft erst nach dem ersten echten Laden (nicht schon beim leeren Initial-
  // State), damit die Fett-Markierung für diesen Besuch stabil bleibt –
  // markFuerUnsRead im Hintergrund lässt die Zeile nicht sofort "entfetten".
  const unreadSnapshot = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!loaded || !familyId || unreadSnapshot.current !== null) return;
    unreadSnapshot.current = new Set(unreadIds);
    if (unreadIds.length > 0) markFuerUnsRead(familyId, unreadIds).catch(() => {});
  }, [loaded, familyId, unreadIds]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [draftEmoji, setDraftEmoji] = useState<string | null>(null);
  const [comboSheetOpen, setComboSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const handleSaveName = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    updateSettings({ myName: trimmed });
  }, [nameDraft, updateSettings]);

  const handleAdd = useCallback(async () => {
    const text = draft.trim();
    if ((!text && !draftEmoji) || !myName || !familyId) return;
    setDraft('');
    const emoji = draftEmoji;
    setDraftEmoji(null);
    try {
      await addFuerUnsMessage(familyId, text, myName, emoji);
    } catch {}
  }, [draft, myName, familyId, draftEmoji]);

  const handleReact = useCallback(async (item: FuerUnsItem, emoji: string) => {
    setReactionPickerFor(null);
    if (!myName || !familyId) return;
    try {
      const next = item.reaction?.emoji === emoji && item.reaction?.by === myName
        ? null
        : { emoji, by: myName };
      await setFuerUnsReaction(familyId, item.id, next);
    } catch {}
  }, [myName, familyId]);

  const handleDelete = useCallback(async (item: FuerUnsItem) => {
    if (!familyId) return;
    setBusyId(item.id);
    try { await deleteFuerUnsMessage(familyId, item.id); } finally { setBusyId(null); }
  }, [familyId]);

  const handleRestore = useCallback(async (item: FuerUnsItem) => {
    if (!familyId) return;
    setBusyId(item.id);
    try { await restoreFuerUnsMessage(familyId, item.id); } finally { setBusyId(null); }
  }, [familyId]);

  const handlePermanentDelete = useCallback(async (item: FuerUnsItem) => {
    if (!familyId) return;
    setBusyId(item.id);
    try { await permanentlyDeleteFuerUnsMessage(familyId, item.id); } finally { setBusyId(null); }
  }, [familyId]);

  const handleStartEdit = useCallback((item: FuerUnsItem) => {
    setReactionPickerFor(null);
    setEditingId(item.id);
    setEditDraft(item.text);
  }, []);

  const handleSaveEdit = useCallback(async (item: FuerUnsItem) => {
    const trimmed = editDraft.trim();
    setEditingId(null);
    if (!trimmed || trimmed === item.text || !familyId) return;
    try { await updateFuerUnsMessage(familyId, item.id, trimmed); } catch {}
  }, [editDraft, familyId]);

  const accent = '#E8607A';

  if (!familyId) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={accent} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {!myName ? (
          <View style={s.namePrompt}>
            <Text style={[s.namePromptText, { color: colors.textSecondary }]}>
              Wie heißt du? So sieht euer Partner, von wem eine Nachricht stammt.
            </Text>
            <View style={s.nameRow}>
              <TextInput
                style={[s.nameInput, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                placeholder="z. B. Matthias"
                placeholderTextColor={colors.placeholder}
                value={nameDraft}
                onChangeText={setNameDraft}
                onSubmitEditing={handleSaveName}
                returnKeyType="done"
              />
              <Pressable
                style={[s.saveNameBtn, { backgroundColor: accent, opacity: nameDraft.trim() ? 1 : 0.4 }]}
                onPress={handleSaveName}
                disabled={!nameDraft.trim()}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Text style={[s.inspiration, { color: colors.textMuted }]}>{PLACEHOLDER}</Text>

            {/* Fertige Icon-Kombos statt Einzelauswahl (TE-62), versteckt hinter
                einem Bottom-Sheet-Dialog statt dauerhaft sichtbar (TE-63). */}
            {draftEmoji ? (
              <Pressable onPress={() => setComboSheetOpen(true)} style={[s.comboSelected, { borderColor: accent, backgroundColor: accent + '18' }]} hitSlop={4}>
                <Text style={s.comboChipEmoji}>{draftEmoji}</Text>
                <Text style={[s.comboSelectedLabel, { color: colors.text }]}>
                  {FUER_UNS_COMBOS.find((c) => c.emoji === draftEmoji)?.label ?? ''}
                </Text>
                <Pressable onPress={() => setDraftEmoji(null)} hitSlop={8} style={{ marginLeft: 'auto' }}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              </Pressable>
            ) : (
              <Pressable onPress={() => setComboSheetOpen(true)} style={[s.comboTrigger, { borderColor: colors.border }]} hitSlop={4}>
                <Ionicons name="sparkles-outline" size={15} color={colors.textMuted} />
                <Text style={[s.comboTriggerText, { color: colors.textMuted }]}>Icon-Kombo hinzufügen (optional)</Text>
              </Pressable>
            )}

            <Modal visible={comboSheetOpen} transparent animationType="slide" onRequestClose={() => setComboSheetOpen(false)}>
              <View style={s.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setComboSheetOpen(false)} />
                <View style={[s.sheet, { backgroundColor: colors.surface, borderTopColor: accent }]}>
                  <Text style={[s.sheetTitle, { color: colors.text }]}>Icon-Kombo wählen</Text>
                  <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                    {FUER_UNS_COMBOS.map((c) => {
                      const selected = draftEmoji === c.emoji;
                      return (
                        <Pressable
                          key={c.emoji}
                          onPress={() => { setDraftEmoji(selected ? null : c.emoji); setComboSheetOpen(false); }}
                          style={[s.sheetRow, { borderColor: selected ? accent : colors.border, backgroundColor: selected ? accent + '18' : 'transparent' }]}
                        >
                          <Text style={s.comboChipEmoji}>{c.emoji}</Text>
                          <Text style={[s.sheetRowLabel, { color: colors.text }]}>{c.label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Pressable onPress={() => setComboSheetOpen(false)} style={s.sheetCloseBtn}>
                    <Text style={[s.sheetCloseBtnText, { color: colors.textMuted }]}>Schließen</Text>
                  </Pressable>
                </View>
              </View>
            </Modal>

            <TextInput
              style={[s.addInput, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
              placeholder="Deine Nachricht …"
              placeholderTextColor={colors.placeholder}
              value={draft}
              onChangeText={setDraft}
              multiline
              textAlignVertical="top"
              returnKeyType="default"
            />
            <View style={s.addBtnRow}>
              <Pressable
                style={[s.addBtn, { backgroundColor: accent, opacity: draft.trim() || draftEmoji ? 1 : 0.4 }]}
                onPress={handleAdd}
                disabled={!draft.trim() && !draftEmoji}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>

            {loadError ? (
              <View style={s.emptyRow}>
                <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
                <Text style={[s.emptyText, { color: colors.danger }]}>
                  Verlauf kann nicht geladen werden – fehlende Firestore-Berechtigung für „shared".
                </Text>
              </View>
            ) : items.length === 0 ? (
              <View style={s.emptyRow}>
                <Ionicons name="heart-outline" size={16} color={colors.textMuted} />
                <Text style={[s.emptyText, { color: colors.textMuted }]}>Noch nichts geschickt – fang an.</Text>
              </View>
            ) : (
              <View style={{ gap: 2 }}>
                {items.map((item) => {
                  const pickerOpen = reactionPickerFor === item.id;
                  const reactedByMe = !!item.reaction && item.reaction.by === myName;
                  const isUnread = unreadSnapshot.current?.has(item.id) ?? false;
                  return (
                    <View key={item.id}>
                      <View style={[s.row, { borderColor: isUnread ? accent + '55' : colors.border, backgroundColor: isUnread ? accent + '10' : 'transparent' }]}>
                        <View style={{ flex: 1 }}>
                          {editingId === item.id ? (
                            <TextInput
                              style={[s.editInput, { color: colors.text, borderColor: accent, backgroundColor: colors.inputBackground }]}
                              value={editDraft}
                              onChangeText={setEditDraft}
                              onBlur={() => handleSaveEdit(item)}
                              autoFocus
                              multiline
                            />
                          ) : (
                            <Text style={[s.itemText, { color: colors.text }, isUnread && { fontWeight: '800' }]}>
                              {item.emoji ? `${item.emoji} ` : ''}{item.text}
                            </Text>
                          )}
                          {item.emoji && (
                            <Text style={[s.comboLabel, { color: colors.textMuted }]}>
                              {FUER_UNS_COMBOS.find((c) => c.emoji === item.emoji)?.label}
                            </Text>
                          )}
                          <View style={s.itemMetaRow}>
                            {isUnread && <View style={[s.unreadDot, { backgroundColor: accent }]} />}
                            <Text style={[s.itemMeta, { color: colors.textMuted }]}>
                              von {item.addedBy} · {formatDateTime(item.createdAt)}
                            </Text>
                            {item.reaction && (
                              <View style={[s.reactionBadge, { borderColor: reactedByMe ? accent : colors.border }]}>
                                <Text style={s.reactionBadgeEmoji}>{item.reaction.emoji}</Text>
                                <Text style={[s.reactionBadgeText, { color: colors.textMuted }]}>von {item.reaction.by}</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {editingId !== item.id && (
                          <Pressable onPress={() => handleStartEdit(item)} hitSlop={8} style={s.iconBtn}>
                            <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
                          </Pressable>
                        )}
                        {editingId !== item.id && (
                          <Pressable
                            onPress={() => { setReactionPickerFor(pickerOpen ? null : item.id); setExtraOpen(false); }}
                            hitSlop={8}
                            style={s.iconBtn}
                          >
                            <Ionicons
                              name={item.reaction ? 'heart' : 'heart-outline'}
                              size={18}
                              color={item.reaction ? accent : colors.textMuted}
                            />
                          </Pressable>
                        )}
                        {editingId !== item.id && (
                          <Pressable
                            onPress={() => handleDelete(item)}
                            hitSlop={8}
                            disabled={busyId === item.id}
                            style={[s.iconBtn, { backgroundColor: colors.danger + '22', borderRadius: 14 }]}
                          >
                            <Ionicons name="close" size={16} color={colors.danger} />
                          </Pressable>
                        )}
                      </View>

                      {pickerOpen && (
                        <View style={[s.reactionPicker, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
                          {FUER_UNS_REACTIONS.map((r) => (
                            <Pressable key={r} onPress={() => handleReact(item, r)} hitSlop={6} style={s.reactionPickerBtn}>
                              <Text style={s.reactionPickerEmoji}>{r}</Text>
                            </Pressable>
                          ))}
                          <Pressable onPress={() => setExtraOpen((v) => !v)} hitSlop={6} style={s.reactionPickerBtn}>
                            <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />
                          </Pressable>
                        </View>
                      )}
                      {pickerOpen && extraOpen && (
                        <View style={[s.reactionPicker, { borderColor: colors.border, backgroundColor: colors.inputBackground, marginTop: 2 }]}>
                          {FUER_UNS_REACTIONS_EXTRA.map((r) => (
                            <Pressable key={r} onPress={() => handleReact(item, r)} hitSlop={6} style={s.reactionPickerBtn}>
                              <Text style={s.reactionPickerEmoji}>{r}</Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {deletedItems.length > 0 && (
              <Pressable onPress={() => setHistoryOpen((v) => !v)} style={s.historyToggle} hitSlop={8}>
                <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
                <Text style={[s.historyToggleText, { color: colors.textMuted }]}>
                  Zuletzt gelöscht ({deletedItems.length})
                </Text>
              </Pressable>
            )}

            {historyOpen && deletedItems.length > 0 && (
              <View style={[s.trashSection, { borderColor: colors.border }]}>
                {deletedItems.map((item) => {
                  const comboLabel = item.emoji ? FUER_UNS_COMBOS.find((c) => c.emoji === item.emoji)?.label : null;
                  const trashLabel = [item.text, comboLabel].filter(Boolean).join(' · ');
                  return (
                  <View key={item.id} style={[s.trashRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.trashItemText, { color: colors.textMuted }]} numberOfLines={1}>
                        {trashLabel}
                      </Text>
                      <Text style={[s.itemMeta, { color: colors.textMuted }]}>
                        {formatDateTime(item.deletedAt ?? item.createdAt)}
                      </Text>
                    </View>
                    <Pressable onPress={() => handleRestore(item)} hitSlop={8} disabled={busyId === item.id} style={[s.restoreBtn, { borderColor: accent }]}>
                      <Ionicons name="arrow-undo-outline" size={14} color={accent} />
                    </Pressable>
                    <Pressable onPress={() => handlePermanentDelete(item)} hitSlop={8} disabled={busyId === item.id} style={[s.iconBtn, { backgroundColor: colors.danger + '22', borderRadius: 14 }]}>
                      <Ionicons name="close" size={14} color={colors.danger} />
                    </Pressable>
                  </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },

  namePrompt: { gap: 8 },
  namePromptText: { fontSize: 13, lineHeight: 18 },
  nameRow: { flexDirection: 'row', gap: 8 },
  nameInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  saveNameBtn: { width: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  inspiration: { fontSize: 12.5, lineHeight: 18, fontStyle: 'italic' },

  // Fertige Icon-Kombos beim Verfassen, versteckt hinter Bottom-Sheet (TE-62/TE-63)
  comboTrigger: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 10, paddingVertical: 6 },
  comboTriggerText: { fontSize: 12, fontWeight: '600' },
  comboSelected: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 8 },
  comboSelectedLabel: { fontSize: 12.5, fontWeight: '600' },
  comboChipEmoji: { fontSize: 16 },

  // Bottom-Sheet-Dialog (gleiches Pattern wie LinkModal in LinksScreen.tsx)
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 3, paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 36 : 20, gap: 10, paddingTop: 20 },
  sheetTitle: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 6 },
  sheetRowLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  sheetCloseBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  sheetCloseBtnText: { fontSize: 13, fontWeight: '600' },

  addInput: { width: '100%', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, lineHeight: 20, minHeight: 130 },
  addBtnRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  addBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  emptyText: { fontSize: 13, flex: 1 },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1 },
  iconBtn: { padding: 4 },
  editInput: { fontSize: 14, fontWeight: '600', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  itemText: { fontSize: 14, lineHeight: 19 },
  comboLabel: { fontSize: 11.5, fontStyle: 'italic', marginTop: 2 },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  itemMeta: { fontSize: 11 },
  unreadDot: { width: 6, height: 6, borderRadius: 3 },

  reactionBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  reactionBadgeEmoji: { fontSize: 11 },
  reactionBadgeText: { fontSize: 10 },
  reactionPicker: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4, alignSelf: 'flex-start' },
  reactionPickerBtn: { padding: 2 },
  reactionPickerEmoji: { fontSize: 18 },

  historyToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  historyToggleText: { fontSize: 12, fontWeight: '600' },
  trashSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, gap: 2 },
  trashRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  trashItemText: { fontSize: 13, textDecorationLine: 'line-through' },
  restoreBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
