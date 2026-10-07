/**
 * FuerUnsScreen.tsx (TE-55)
 *
 * "Für uns": private tägliche Wertschätzungsnachrichten zwischen den Eltern.
 * Freier Text ohne Pflicht-Kategorie (Placeholder inspiriert: Liebevolles,
 * Erotisches, Gedanken, Lob – ein Kritikpunkt nur ganz sanft angedeutet).
 * Eine gemeinsame chronologische Liste (neueste zuerst), Emoji-Reaction und
 * Soft-Delete/Bearbeiten wie bei der geteilten Liste (sharedNotes.ts).
 *
 * Ungelesene Nachrichten vom Partner sind umrandet/fett hervorgehoben (readAt
 * fehlt). Erst ein Tap auf die Zeile markiert sie in Firestore als gelesen –
 * kein automatisches Markieren beim bloßen Öffnen des Tabs, damit der Tab-
 * Badge wirklich signalisiert "das hast du noch nicht bewusst gesehen".
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../utils/theme';
import {
  FuerUnsItem,
  addFuerUnsMessage,
  setFuerUnsReaction,
  updateFuerUnsMessage,
  deleteFuerUnsMessage,
  restoreFuerUnsMessage,
  permanentlyDeleteFuerUnsMessage,
  setFuerUnsReadState,
  setFuerUnsArchived,
  setFuerUnsMood,
  setFuerUnsPause,
  FUER_UNS_MOOD_LEVELS,
  FUER_UNS_CARE_COMBOS,
  FUER_UNS_PAUSE_UIDS,
  FUER_UNS_REACTIONS,
  FUER_UNS_REACTIONS_EXTRA,
  FUER_UNS_COMBOS,
  FUER_UNS_FIRST_HOT,
  fuerUnsComboLabel,
  pendingReplyFor,
} from '../services/fuerUns';
import { useFuerUns } from '../hooks/useFuerUns';

const PAUSE = '#D98AA8';

function formatDateTime(iso: string): string {
  return format(parseISO(iso), 'dd.MM.yyyy, HH:mm');
}


export function FuerUnsScreen() {
  const { colors, isDark } = useTheme();
  const { familyId, myUid, myName, items, deletedItems, archivedItems, loadError, myMood, partnerMood, myPause, partnerPause, partnerName, myDisplayName, partnerChanged, markPartnerSeen } = useFuerUns();
  const partner = partnerName ?? 'Partner';
  const pendingReply = myUid ? pendingReplyFor(items, myUid) : null;

  // Tab sichtbar → Änderung des Partners gilt als gesehen (Tab-Badge und „NEU“ verschwinden).
  useFocusEffect(useCallback(() => {
    if (partnerChanged) markPartnerSeen();
  }, [partnerChanged, markPartnerSeen]));

  const handleToggleRead = useCallback((item: FuerUnsItem) => {
    if (!familyId || item.addedByUid === myUid) return;
    setFuerUnsReadState(familyId, item.id, !item.readAt).catch(() => {});
  }, [familyId, myUid]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [comboGroup, setComboGroup] = useState<'love' | 'hot'>('love');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const handleAdd = useCallback(async () => {
    const text = draft.trim();
    if (!text || !myName || !myUid || !familyId) return;
    setDraft('');
    try {
      await addFuerUnsMessage(familyId, text, myName, myUid);
    } catch {}
  }, [draft, myName, myUid, familyId]);

  /** Kombo mit einem Tipp senden; als Antwort markiert sie die Partner-Nachricht gleich als gelesen. */
  const sendCombo = useCallback(async (emoji: string, replyTo?: FuerUnsItem) => {
    if (!myName || !myUid || !familyId) return;
    const text = draft.trim();
    setDraft('');
    try {
      await addFuerUnsMessage(familyId, text, myName, myUid, emoji);
      if (replyTo && !replyTo.readAt) await setFuerUnsReadState(familyId, replyTo.id, true);
    } catch {}
  }, [draft, myName, myUid, familyId]);

  const handleReact = useCallback(async (item: FuerUnsItem, emoji: string) => {
    setReactionPickerFor(null);
    if (!myName || !myUid || !familyId) return;
    try {
      const next = item.reaction?.emoji === emoji && item.reaction?.byUid === myUid
        ? null
        : { emoji, by: myName, byUid: myUid };
      await setFuerUnsReaction(familyId, item.id, next);
    } catch {}
  }, [myName, myUid, familyId]);

  const handleArchive = useCallback((item: FuerUnsItem, archived: boolean) => {
    if (!familyId) return;
    setReactionPickerFor(null);
    setFuerUnsArchived(familyId, item, archived).catch(() => {});
  }, [familyId]);

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

  // TE-25: ohne Freigabe (Rule lehnt ab, z. B. Kinder-Account per Direktlink) nichts vom Inhalt zeigen.
  if (loadError) {
    return (
      <View style={[s.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="lock-closed-outline" size={22} color={colors.textMuted} />
      </View>
    );
  }

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
        {/* Paar-Kopf (TE-17): ihr zwei mit heutigem Stand, dazwischen das Flammen-Herz */}
        <View style={s.couple}>
          {[
            { name: myDisplayName, mood: myMood, pause: myPause, me: true },
            { name: partner, mood: partnerMood, pause: partnerPause, me: false },
          ].map((p, i) => (
            <React.Fragment key={i}>
              {i === 1 && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={s.coupleHeart}>❤️‍🔥</Text>
                  <Text style={[s.coupleSub, { color: colors.textMuted }]}>Liebe & Lust</Text>
                </View>
              )}
              <View style={s.person}>
                <View style={[s.avatar, { borderColor: accent }]}>
                  <Text style={[s.avatarText, { color: colors.text }]}>{(p.name ?? '?').charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={[s.personName, { color: colors.text }]} numberOfLines={1}>{p.name ?? ''}</Text>
                <Text style={[s.personMood, { color: colors.textMuted }]} numberOfLines={1}>
                  {p.pause ? '🌸 Pause'
                    : p.mood ? `${FUER_UNS_MOOD_LEVELS[p.mood.level!].emoji} ${FUER_UNS_MOOD_LEVELS[p.mood.level!].label}`
                    : '–'}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Stimmungsbarometer: gilt für heute */}
        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>Stimmungsbarometer</Text>
        <View style={s.scale}>
          {FUER_UNS_MOOD_LEVELS.map((m, i) => {
            const on = myMood?.level === i;
            return (
              <Pressable
                key={m.label}
                onPress={() => familyId && myUid && setFuerUnsMood(familyId, myUid, i).catch(() => {})}
                style={[s.scaleBtn, { borderColor: on ? accent : colors.border, backgroundColor: on ? accent + '22' : colors.surface, opacity: myPause && i >= 3 ? 0.45 : 1 }]}
              >
                <Text style={s.scaleEmoji}>{m.emoji}</Text>
                <Text style={[s.scaleLabel, { color: on ? colors.text : colors.textMuted }]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Pause 🌸: Dauer per Tipp, endet von selbst – nur bei Diana */}
        {!!myUid && FUER_UNS_PAUSE_UIDS.includes(myUid) && (
        <View style={[s.pauseBox, { borderColor: PAUSE + '66' }]}>
          {myPause ? (
            <View style={s.pauseRow}>
              <Text style={[s.pauseText, { color: colors.text }]}>🌸 Pause bis {format(parseISO(myPause), 'EEEE', { locale: de })}</Text>
              <Pressable onPress={() => familyId && myUid && setFuerUnsPause(familyId, myUid, null).catch(() => {})} hitSlop={6}>
                <Text style={[s.pauseEnd, { color: PAUSE }]}>Beenden</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[s.pauseText, { color: colors.textMuted }]}>🌸 Pause</Text>
          )}
          <View style={s.pauseDurations}>
            {[3, 5, 7].map((d) => (
              <Pressable
                key={d}
                onPress={() => familyId && myUid && setFuerUnsPause(familyId, myUid, d).catch(() => {})}
                style={[s.pauseDur, { borderColor: colors.border }]}
              >
                <Text style={[s.pauseDurText, { color: colors.text }]}>{d} Tage</Text>
              </Pressable>
            ))}
          </View>
        </View>
        )}

        {/* Partner hat Pause → fürsorgliche Kombos statt Druck */}
        {partnerPause && (
          <View style={[s.pauseBox, { borderColor: PAUSE + '66' }]}>
            <Text style={[s.pauseText, { color: colors.text }]}>🌸 {partner} macht gerade Pause. Was ihr guttun könnte:</Text>
            <View style={s.replyChips}>
              {FUER_UNS_CARE_COMBOS.map((c) => (
                <Pressable key={c.emoji} onPress={() => sendCombo(c.emoji)} style={({ pressed }) => [s.comboChip, { borderColor: PAUSE, backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 }]}>
                  <Text style={s.comboChipEmoji}>{c.emoji}</Text>
                  <Text style={[s.comboChipLabel, { color: colors.text }]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Text style={[s.inspiration, { color: colors.textMuted }]}>Was willst du {partner} heute sagen, lieb oder heiß?</Text>

            {/* Antwort-Kombos: liegt der Ball bei mir, antworte ich mit einem Tipp. */}
            {pendingReply && (
              <View style={[s.replyBox, { borderColor: accent + '55', backgroundColor: accent + '10' }]}>
                <Text style={[s.replyTitle, { color: colors.textMuted }]}>
                  Antworte {pendingReply.item.addedBy} mit einem Tipp
                </Text>
                <Text style={[s.itemText, { color: colors.text, fontWeight: '700' }]}>
                  {pendingReply.item.emoji} {fuerUnsComboLabel(pendingReply.item.emoji)}
                </Text>
                <View style={s.replyChips}>
                  {pendingReply.replies.map((r) => (
                    <Pressable
                      key={r.emoji}
                      onPress={() => sendCombo(r.emoji, pendingReply.item)}
                      style={({ pressed }) => [s.comboChip, { borderColor: accent, backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 }]}
                    >
                      <Text style={s.comboChipEmoji}>{r.emoji}</Text>
                      <Text style={[s.comboChipLabel, { color: colors.text }]}>{r.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Kombos ohne Scrollen und ohne Dropdown: zwei Reiter (Lieb / Heiß),
                darunter alle Kombos der Gruppe als 2-Spalten-Raster. Ein Tipp
                sendet sofort (mit dem getippten Text, falls vorhanden). */}
            <View style={s.comboTabs}>
              {(['love', 'hot'] as const).map((g) => {
                const on = comboGroup === g;
                return (
                  <Pressable
                    key={g}
                    onPress={() => setComboGroup(g)}
                    style={[s.comboTab, { borderColor: on ? accent : colors.border, backgroundColor: on ? accent + '22' : 'transparent' }]}
                  >
                    <Text style={[s.comboTabText, { color: on ? colors.text : colors.textMuted }]}>
                      {g === 'love' ? '❤️ Lieb' : '🔥 Heiß'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {comboGroup === 'hot' && partnerPause && (
              <Text style={[s.pauseHint, { color: colors.textMuted, borderColor: PAUSE + '88' }]}>
                🌸 {partner} macht gerade Pause – die Lieb-Kombos passen heute besser.
              </Text>
            )}
            <View style={[s.comboGrid, comboGroup === 'hot' && partnerPause ? { opacity: 0.45 } : null]}>
              {(comboGroup === 'love' ? FUER_UNS_COMBOS.slice(0, FUER_UNS_FIRST_HOT) : FUER_UNS_COMBOS.slice(FUER_UNS_FIRST_HOT)).map((c) => (
                <Pressable
                  key={c.emoji}
                  onPress={() => sendCombo(c.emoji)}
                  style={({ pressed }) => [
                    s.comboChip,
                    s.comboCell,
                    { borderColor: comboGroup === 'hot' ? accent : colors.border, backgroundColor: comboGroup === 'hot' ? accent + '14' : colors.surface, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={s.comboChipEmoji}>{c.emoji}</Text>
                  <Text style={[s.comboChipLabel, { color: colors.text }]} numberOfLines={3}>{c.label}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={[s.addInput, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
              placeholder="Oder selbst schreiben …"
              placeholderTextColor={colors.placeholder}
              value={draft}
              onChangeText={setDraft}
              multiline
              textAlignVertical="top"
              returnKeyType="default"
            />
            <View style={s.addBtnRow}>
              <Pressable
                style={[s.addBtn, { backgroundColor: accent, opacity: draft.trim() ? 1 : 0.4 }]}
                onPress={handleAdd}
                disabled={!draft.trim()}
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
                <Text style={[s.emptyText, { color: colors.textMuted }]}>
                  {archivedItems.length > 0 ? 'Alles erledigt 💛 Neues landet hier.' : 'Noch nichts geschickt – fang an.'}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 2 }}>
                {items.map((item) => {
                  const pickerOpen = reactionPickerFor === item.id;
                  const reactedByMe = !!item.reaction && item.reaction.byUid === myUid;
                  const isUnread = !item.readAt && item.addedByUid !== myUid;
                  return (
                    <View key={item.id}>
                      <Pressable
                        onPress={() => handleToggleRead(item)}
                        style={[s.row, { borderColor: isUnread ? accent + '55' : colors.border, backgroundColor: isUnread ? accent + '10' : 'transparent' }]}
                      >
                        {/* Abhaken → Nachricht wandert in den Verlauf (TE-11) */}
                        <Pressable onPress={() => handleArchive(item, true)} hitSlop={8} style={s.checkBtn}>
                          <Ionicons name="square-outline" size={20} color={colors.textMuted} />
                        </Pressable>
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
                              {fuerUnsComboLabel(item.emoji)}
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
                      </Pressable>

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

            {/* Verlauf: abgehakte Nachrichten, aufklappbar, mit Zurückholen */}
            {archivedItems.length > 0 && (
              <Pressable onPress={() => setArchiveOpen((v) => !v)} style={s.historyToggle} hitSlop={8}>
                <Ionicons name="time-outline" size={14} color={archiveOpen ? accent : colors.textMuted} />
                <Text style={[s.historyToggleText, { color: archiveOpen ? accent : colors.textMuted }]}>
                  Verlauf ({archivedItems.length})
                </Text>
              </Pressable>
            )}

            {archiveOpen && archivedItems.length > 0 && (
              <View style={[s.trashSection, { borderColor: colors.border }]}>
                {archivedItems.map((item) => (
                  <View key={item.id} style={[s.trashRow, { borderBottomColor: colors.border }]}>
                    <Pressable onPress={() => handleArchive(item, false)} hitSlop={8} style={s.checkBtn}>
                      <Ionicons name="checkbox" size={18} color={colors.success} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.archivedText, { color: colors.textMuted }]} numberOfLines={2}>
                        {[item.emoji, item.text || fuerUnsComboLabel(item.emoji)].filter(Boolean).join(' ')}
                      </Text>
                      <Text style={[s.itemMeta, { color: colors.textMuted }]}>
                        von {item.addedBy} · {formatDateTime(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                ))}
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
                  const comboLabel = fuerUnsComboLabel(item.emoji);
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
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },

  inspiration: { fontSize: 12.5, lineHeight: 18, fontStyle: 'italic' },
  couple: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingVertical: 4 },
  coupleHeart: { fontSize: 24 },
  coupleSub: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
  person: { alignItems: 'center', gap: 4, width: 90 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800' },
  personName: { fontSize: 13, fontWeight: '700' },
  personMood: { fontSize: 12 },
  sectionLabel: { fontSize: 11.5, fontWeight: '600' },
  scale: { flexDirection: 'row', gap: 6 },
  scaleBtn: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 5 },
  scaleEmoji: { fontSize: 18 },
  scaleLabel: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
  pauseBox: { borderWidth: 1, borderRadius: 10, padding: 9, gap: 7 },
  pauseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pauseText: { fontSize: 12.5, fontWeight: '600' },
  pauseEnd: { fontSize: 12.5, fontWeight: '700' },
  pauseDurations: { flexDirection: 'row', gap: 6 },
  pauseDur: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingVertical: 5 },
  pauseDurText: { fontSize: 12, fontWeight: '700' },
  pauseHint: { fontSize: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, padding: 7 },

  // Kombo-Chip-Leiste + Antwort-Kombos
  comboTabs: { flexDirection: 'row', gap: 6 },
  comboTab: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 6 },
  comboTabText: { fontSize: 13, fontWeight: '700' },
  comboGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  comboCell: { flexBasis: '48%', flexGrow: 1, maxWidth: '100%', borderRadius: 12 },
  comboChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 230 },
  comboChipEmoji: { fontSize: 15, flexShrink: 0 },
  comboChipLabel: { fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  replyBox: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  replyTitle: { fontSize: 11.5, fontWeight: '600' },
  replyChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  addInput: { width: '100%', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, lineHeight: 20, minHeight: 130 },
  addBtnRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  addBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  emptyText: { fontSize: 13, flex: 1 },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1 },
  iconBtn: { padding: 4 },
  checkBtn: { paddingTop: 1 },
  archivedText: { fontSize: 13 },
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
