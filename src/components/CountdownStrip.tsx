/**
 * CountdownStrip.tsx (TE-128 / TE-130)
 *
 * Filigrane, quadratische Countdown-Karten oberhalb der Termine auf dem
 * Dashboard – für motivierende Ereignisse wie "Gemeinsamer Urlaub". Zeigt die
 * verbleibenden Tage groß und zentral; ein "+"-Kärtchen legt neue Countdowns
 * an. Antippen einer Karte öffnet sie zum Bearbeiten/Löschen.
 *
 * TE-130: Die Countdowns werden über Firestore mit der Partnerin geteilt
 * (gleiches Muster wie die geteilte Notizliste in SharedNotepad.tsx) – beide
 * sehen dieselben Karten in Echtzeit. Dafür wird wie dort einmalig der eigene
 * Anzeigename (settings.myName) abgefragt, damit Einträge zuordenbar sind.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Modal, ActivityIndicator, Dimensions, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useStore } from '../store';
import { ThemeColors, useTheme } from '../utils/theme';
import { DatePickerModal } from './DatePickerModal';
import { useFamilyId } from '../hooks/useFamily';
import {
  SharedCountdown,
  subscribeToSharedCountdowns,
  addSharedCountdown,
  updateSharedCountdown,
  deleteSharedCountdown,
} from '../services/sharedCountdowns';

const COUNTDOWN_EMOJIS = ['✈️', '🏖️', '🎉', '🎂', '❤️', '🎄', '🏡', '⭐'];

/** Tage bis zum Zieldatum (kalendarisch, ohne Uhrzeit) – negativ, wenn vorbei. */
function daysUntil(targetDate: string): number {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(targetDate + 'T00:00:00');
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((targetMidnight.getTime() - todayMidnight.getTime()) / 86_400_000);
}

function formatDateDe(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Liebevolle, emotionale Zeile passend zur Restzeit – macht aus einem nüchternen Zähler eine Vorfreude-Anzeige. */
function motivationLine(days: number, isToday: boolean, isPast: boolean): string {
  if (isToday) return 'Heute ist es soweit! 🎉';
  if (isPast) return 'Geschafft 💛';
  if (days <= 3) return 'Gleich ist es so weit! 🤩';
  if (days <= 14) return 'Wir freuen uns schon riesig! 🥰';
  return 'Wir zählen die Tage zusammen ✨';
}

/**
 * Dezenter Neon-Hintergrundeffekt: ein schräger Lichtstreifen "schwimmt" wie
 * eine Spiegelung/Welle quer über die Karte – sanfte Endlosschleife, damit
 * die Kacheln auf den ersten Blick lebendig und ein bisschen magisch wirken.
 */
function NeonSweep({ accent }: { accent: string }) {
  const { reduceMotion } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Calm-Theme: kein wandernder Lichtstreifen – die Kacheln bleiben ruhig.
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(900),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);

  if (reduceMotion) return null;

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-CARD_WIDTH * 1.3, CARD_WIDTH * 1.3],
  });

  return (
    <View style={styles.sweepClip} pointerEvents="none">
      <Animated.View style={[styles.sweepBand, { transform: [{ translateX }, { rotate: '-18deg' }] }]}>
        <LinearGradient
          colors={['transparent', accent + '00', accent + '4D', accent + '00', 'transparent']}
          locations={[0, 0.35, 0.5, 0.65, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

function CountdownCard({ countdown, colors, onPress, compact = false }: { countdown: SharedCountdown; colors: ThemeColors; onPress: () => void; compact?: boolean }) {
  const days = daysUntil(countdown.targetDate);
  const isPast = days < 0;
  const isToday = days === 0;
  const accent = colors.accentNeon;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        {
          borderColor: isToday ? accent : colors.border,
          backgroundColor: isToday ? accent + '14' : colors.surface,
          opacity: pressed ? 0.7 : isPast ? 0.6 : 1,
        },
      ]}
    >
      <NeonSweep accent={accent} />
      <View style={[styles.cardEmojiWrap, compact && styles.cardEmojiWrapCompact, { backgroundColor: accent + '22' }]}>
        <Text style={[styles.cardEmojiBig, compact && styles.cardEmojiBigCompact]}>{countdown.emoji ?? '💛'}</Text>
      </View>
      <View style={styles.cardBody}>
        {isToday ? (
          <Text style={[styles.cardBigLabel, compact && styles.cardBigLabelCompact, { color: accent }]} numberOfLines={1}>Heute! 🎉</Text>
        ) : isPast ? (
          <Text style={[styles.cardBigLabel, compact && styles.cardBigLabelCompact, { color: colors.textMuted }]} numberOfLines={1}>vorbei</Text>
        ) : (
          <View style={styles.cardNumberRow}>
            <Text style={[styles.cardNumber, compact && styles.cardNumberCompact, { color: colors.text }]}>{days}</Text>
            <Text style={[styles.cardUnit, compact && styles.cardUnitCompact, { color: colors.textMuted }]}>{days === 1 ? 'Tag' : 'Tage'}</Text>
          </View>
        )}
        <Text style={[styles.cardTitle, compact && styles.cardTitleCompact, { color: colors.textSecondary }]} numberOfLines={1}>
          {countdown.title}
        </Text>
        {/* TE-153: In der kompakten Spalte entfällt die Motivationszeile, damit die Kachel flach bleibt. */}
        {!compact && (
          <Text style={[styles.cardMotivation, { color: accent }]} numberOfLines={1}>
            {motivationLine(days, isToday, isPast)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function AddCard({ colors, onPress, compact = false }: { colors: ThemeColors; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        styles.addCard,
        { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Ionicons name="add" size={compact ? 18 : 22} color={colors.textMuted} />
      <Text style={[styles.addCardText, compact && styles.addCardTextCompact, { color: colors.textMuted }]}>Neue Vorfreude</Text>
    </Pressable>
  );
}

export function CountdownStrip({ colors, compact = false }: { colors: ThemeColors; compact?: boolean }) {
  const { settings, updateSettings } = useStore();
  const familyId = useFamilyId();
  const [items, setItems] = useState<SharedCountdown[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<SharedCountdown | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [emojiDraft, setEmojiDraft] = useState<string | null>(COUNTDOWN_EMOJIS[0]);
  const [dateDraft, setDateDraft] = useState<Date | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!familyId) return;
    const unsub = subscribeToSharedCountdowns(
      familyId,
      (next) => { setLoadError(false); setItems(next); },
      () => { setLoadError(true); setItems([]); }
    );
    return unsub;
  }, [familyId]);

  const myName = settings.myName?.trim() || null;

  const sorted = useMemo(
    () => [...(items ?? [])].sort((a, b) => daysUntil(a.targetDate) - daysUntil(b.targetDate)),
    [items]
  );

  const handleSaveName = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    updateSettings({ myName: trimmed });
  }, [nameDraft, updateSettings]);

  const openNew = useCallback(() => {
    setEditing(null);
    setTitleDraft('');
    setEmojiDraft(COUNTDOWN_EMOJIS[0]);
    setDateDraft(null);
    setFormVisible(true);
  }, []);

  const openEdit = useCallback((c: SharedCountdown) => {
    setEditing(c);
    setTitleDraft(c.title);
    setEmojiDraft(c.emoji ?? null);
    setDateDraft(new Date(c.targetDate + 'T00:00:00'));
    setFormVisible(true);
  }, []);

  const handleSave = useCallback(async () => {
    const title = titleDraft.trim();
    if (!title || !dateDraft || !myName) return;
    const isoDate = `${dateDraft.getFullYear()}-${String(dateDraft.getMonth() + 1).padStart(2, '0')}-${String(dateDraft.getDate()).padStart(2, '0')}`;
    setBusy(true);
    try {
      if (editing) {
        await updateSharedCountdown(familyId, editing.id, { title, emoji: emojiDraft, targetDate: isoDate });
      } else {
        await addSharedCountdown(familyId, title, isoDate, emojiDraft, myName);
      }
      setFormVisible(false);
    } catch {
    } finally {
      setBusy(false);
    }
  }, [editing, titleDraft, emojiDraft, dateDraft, myName]);

  const handleDelete = useCallback(async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await deleteSharedCountdown(familyId, editing.id);
      setFormVisible(false);
    } catch {
    } finally {
      setBusy(false);
    }
  }, [editing]);

  const accent = colors.accentNeon;
  const canSave = titleDraft.trim().length > 0 && !!dateDraft && !busy;

  if (!familyId) return null;

  return (
    <View style={styles.wrap}>
      {loadError ? (
        <View style={styles.errorRow}>
          <Ionicons name="cloud-offline-outline" size={15} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>
            Countdowns können nicht geladen werden – fehlende Firestore-Berechtigung für „shared". Bitte Regeln in der Firebase-Konsole prüfen.
          </Text>
        </View>
      ) : items === null ? (
        <ActivityIndicator color={accent} style={{ marginVertical: 10, marginLeft: 16 }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {sorted.map((c) => (
            <CountdownCard key={c.id} countdown={c} colors={colors} onPress={() => openEdit(c)} compact={compact} />
          ))}
          <AddCard colors={colors} onPress={openNew} compact={compact} />
        </ScrollView>
      )}

      <Modal visible={formVisible} animationType="fade" transparent onRequestClose={() => setFormVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFormVisible(false)}>
          <Pressable style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <View style={styles.formHeader}>
              <Text style={[styles.formTitle, { color: colors.text }]}>
                {editing ? 'Countdown bearbeiten' : 'Neuer Countdown'}
              </Text>
              <Pressable onPress={() => setFormVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            {!myName ? (
              // Einmaliger Mini-Dialog: Name festlegen, damit Karten zuordenbar sind (TE-130).
              <View style={styles.namePrompt}>
                <Text style={[styles.namePromptText, { color: colors.textSecondary }]}>
                  Diese Countdowns werden mit deiner Partnerin geteilt. Wie heißt du? So sieht man, wer eine Karte angelegt hat.
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
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <Text style={[formStyles_subtitle(colors)]}>
                  Gib ein, worauf ihr euch freut – z. B. „Gemeinsamer Urlaub" – und bis wann es noch dauert. Das soll motivieren! 💪
                </Text>

                <TextInput
                  style={[styles.input, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                  placeholder="z. B. Gemeinsamer Urlaub"
                  placeholderTextColor={colors.placeholder}
                  value={titleDraft}
                  onChangeText={setTitleDraft}
                />

                <View style={styles.emojiRow}>
                  {COUNTDOWN_EMOJIS.map((e) => {
                    const selected = emojiDraft === e;
                    return (
                      <Pressable
                        key={e}
                        onPress={() => setEmojiDraft(selected ? null : e)}
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

                <Pressable
                  onPress={() => setDatePickerVisible(true)}
                  style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.dateBtnText, { color: dateDraft ? colors.text : colors.placeholder }]}>
                    {dateDraft ? formatDateDe(`${dateDraft.getFullYear()}-${String(dateDraft.getMonth() + 1).padStart(2, '0')}-${String(dateDraft.getDate()).padStart(2, '0')}`) : 'Zieldatum wählen …'}
                  </Text>
                </Pressable>

                {editing && editing.addedBy ? (
                  <Text style={[styles.addedByText, { color: colors.textMuted }]}>
                    Angelegt von {editing.addedBy}
                  </Text>
                ) : null}

                <View style={styles.formActions}>
                  {editing && (
                    <Pressable onPress={handleDelete} hitSlop={8} style={styles.deleteBtn} disabled={busy}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      <Text style={[styles.deleteBtnText, { color: colors.danger }]}>Löschen</Text>
                    </Pressable>
                  )}
                  <View style={{ flex: 1 }} />
                  <Pressable
                    onPress={handleSave}
                    disabled={!canSave}
                    style={[styles.saveBtn, { backgroundColor: accent, opacity: canSave ? 1 : 0.4 }]}
                  >
                    <Text style={styles.saveBtnText}>Speichern</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <DatePickerModal
        visible={datePickerVisible}
        value={dateDraft}
        onConfirm={(d) => { setDateDraft(d); setDatePickerVisible(false); }}
        onCancel={() => setDatePickerVisible(false)}
        colors={colors}
      />
    </View>
  );
}

// Kleiner Helfer, weil StyleSheet keine dynamischen Farben unterstützt.
function formStyles_subtitle(colors: ThemeColors) {
  return { fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: 12, lineHeight: 17 };
}

// Drei Karten passen nebeneinander auf den Bildschirm – etwas breiter und
// dafür flacher als zuvor (weniger Höhe auf dem Dashboard, TE-128-Feedback).
const SCREEN_WIDTH = Dimensions.get('window').width;
const STRIP_PADDING = 16;
const CARD_GAP = 10;
const CARD_WIDTH = (SCREEN_WIDTH - STRIP_PADDING * 2 - CARD_GAP * 2) / 3;
const CARD_HEIGHT = Math.round(CARD_WIDTH * 0.66);

// TE-153: kompakte Kacheln für die schmale Dashboard-Spalte – deutlich kleiner
// als die regulären Karten, ohne Motivationszeile, damit mehrere in die Spalte
// passen (horizontal scrollbar).
const COMPACT_CARD_WIDTH = 110;
const COMPACT_CARD_HEIGHT = 60;

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  scrollContent: { paddingHorizontal: 16, gap: 10 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 6 },
  errorText: { fontSize: 11, flex: 1, lineHeight: 15 },

  // "Filigran", aber herzlich: dünner Rahmen, große Eckenrundung, dafür ein
  // warmer Akzent-Farbton im Hintergrund und eine liebevolle Zeile, die die
  // Vorfreude zeigt – breiter und flacher als zuvor (TE-128-Feedback).
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
    overflow: 'hidden',
  },
  // Container, der den Neon-Streifen exakt auf die Kachel zuschneidet, damit
  // die "Welle" nicht über den Rand hinausragt (Spiegel-Effekt, TE-128).
  sweepClip: { ...StyleSheet.absoluteFillObject, borderRadius: 16, overflow: 'hidden' },
  sweepBand: {
    position: 'absolute',
    top: -CARD_HEIGHT,
    left: 0,
    width: CARD_WIDTH * 0.7,
    height: CARD_HEIGHT * 3,
  },
  cardEmojiWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmojiBig: { fontSize: 20 },
  cardBody: { flex: 1, gap: 1 },
  cardNumberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  cardNumber: { fontSize: 22, fontWeight: '800', lineHeight: 24 },
  cardUnit: { fontSize: 11 },
  cardBigLabel: { fontSize: 14, fontWeight: '800' },
  cardTitle: { fontSize: 11, fontWeight: '700' },
  cardMotivation: { fontSize: 10, fontWeight: '600' },

  // TE-153: kompakte Varianten für die schmale Dashboard-Spalte.
  cardCompact: { width: COMPACT_CARD_WIDTH, height: COMPACT_CARD_HEIGHT, borderRadius: 12, paddingHorizontal: 8, gap: 6 },
  cardEmojiWrapCompact: { width: 26, height: 26, borderRadius: 13 },
  cardEmojiBigCompact: { fontSize: 14 },
  cardNumberCompact: { fontSize: 15, lineHeight: 17 },
  cardUnitCompact: { fontSize: 8 },
  cardBigLabelCompact: { fontSize: 11 },
  cardTitleCompact: { fontSize: 9 },

  addCard: { borderStyle: 'dashed', flexDirection: 'column', gap: 4, justifyContent: 'center' },
  addCardText: { fontSize: 10, fontWeight: '700' },
  addCardTextCompact: { fontSize: 9 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  formCard: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 18 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formTitle: { fontSize: 16, fontWeight: '800' },

  namePrompt: { gap: 8, paddingTop: 4, paddingBottom: 4 },
  namePromptText: { fontSize: 12.5, lineHeight: 18 },
  nameRow: { flexDirection: 'row', gap: 8 },
  nameInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveNameBtn: { width: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },

  emojiRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  emojiChip: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  emojiChipText: { fontSize: 17 },

  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8 },
  dateBtnText: { fontSize: 14 },
  addedByText: { fontSize: 11, marginBottom: 8 },

  formActions: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deleteBtnText: { fontSize: 13, fontWeight: '700' },
  saveBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
