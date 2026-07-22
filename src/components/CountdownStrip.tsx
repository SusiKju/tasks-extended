/**
 * CountdownStrip.tsx (TE-128 / TE-171)
 *
 * Filigrane, quadratische Countdown-Karten oberhalb der Termine auf dem
 * Dashboard – für motivierende Ereignisse wie "Gemeinsamer Urlaub". Zeigt die
 * verbleibenden Tage groß und zentral; ein "+"-Kärtchen legt neue Countdowns
 * an. Antippen einer Karte öffnet sie zum Bearbeiten/Löschen.
 *
 * TE-171: Countdowns sind privat pro User (vorher TE-130: geteilt mit der
 * Partnerin über shared/countdowns). Jeder Family-Account sieht nur seine
 * eigenen Karten.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../utils/theme';
import { DatePickerModal } from './DatePickerModal';
import { useFamilyId } from '../hooks/useFamily';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import {
  Countdown,
  subscribeToCountdowns,
  addCountdown,
  updateCountdown,
  deleteCountdown,
} from '../services/countdownsService';

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

// TE-162: Karten-Design zurück auf die allererste Umsetzung (TE-128) – Icon
// oben mittig, große Zahl + Einheit darunter, Titel darunter, alles zentriert
// in einer quadratischen 84×84-Kachel. Kein Leuchteffekt, keine Motivations-
// zeile, kein farbiger Zahlen-Tab – die zwischenzeitlichen TE-153/TE-157-
// Varianten (Zeilen-Layout mit Motivationszeile, kompakte Karte mit gelbem
// Zahlen-Tab ohne Icon) sind damit abgelöst.
function CountdownCard({ countdown, colors, onPress }: { countdown: Countdown; colors: ThemeColors; onPress: () => void }) {
  const days = daysUntil(countdown.targetDate);
  const isPast = days < 0;
  const isToday = days === 0;
  const accent = colors.accentNeon;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: isToday ? accent : colors.border,
          backgroundColor: colors.surface,
          opacity: pressed ? 0.7 : isPast ? 0.55 : 1,
        },
      ]}
    >
      <Text style={styles.cardEmoji}>{countdown.emoji ?? '💛'}</Text>
      {isToday ? (
        <Text style={[styles.cardBigLabel, { color: accent }]} numberOfLines={1}>Heute! 🎉</Text>
      ) : isPast ? (
        <Text style={[styles.cardBigLabel, { color: colors.textMuted }]} numberOfLines={1}>vorbei</Text>
      ) : (
        <>
          <Text style={[styles.cardNumber, { color: colors.text }]}>{days}</Text>
          <Text style={[styles.cardUnit, { color: colors.textMuted }]}>{days === 1 ? 'Tag' : 'Tage'}</Text>
        </>
      )}
      <Text style={[styles.cardTitle, { color: colors.textSecondary }]} numberOfLines={2}>
        {countdown.title}
      </Text>
    </Pressable>
  );
}

function AddCard({ colors, onPress }: { colors: ThemeColors; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        styles.addCard,
        { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Ionicons name="add" size={26} color={colors.textMuted} />
      <Text style={[styles.addCardText, { color: colors.textMuted }]}>Countdown</Text>
    </Pressable>
  );
}

export function CountdownStrip({ colors, compact = false }: { colors: ThemeColors; compact?: boolean }) {
  const familyId = useFamilyId();
  const { user } = useFirebaseAuth();
  const uid = user?.uid;
  const [items, setItems] = useState<Countdown[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<Countdown | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [emojiDraft, setEmojiDraft] = useState<string | null>(COUNTDOWN_EMOJIS[0]);
  const [dateDraft, setDateDraft] = useState<Date | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!familyId || !uid) return;
    const unsub = subscribeToCountdowns(
      familyId,
      uid,
      (next) => { setLoadError(false); setItems(next); },
      () => { setLoadError(true); setItems([]); }
    );
    return unsub;
  }, [familyId, uid]);

  const sorted = useMemo(
    () => [...(items ?? [])].sort((a, b) => daysUntil(a.targetDate) - daysUntil(b.targetDate)),
    [items]
  );

  const openNew = useCallback(() => {
    setEditing(null);
    setTitleDraft('');
    setDateDraft(null);
    setEmojiDraft(COUNTDOWN_EMOJIS[0]);
    setFormVisible(true);
  }, []);

  const openEdit = useCallback((c: Countdown) => {
    setEditing(c);
    setTitleDraft(c.title);
    setDateDraft(new Date(c.targetDate + 'T00:00:00'));
    setEmojiDraft(c.emoji ?? null);
    setFormVisible(true);
  }, []);

  // TE-162 zeigt auf den Karten wieder ein Icon (oben mittig) – die
  // Wiederherstellung hatte den Emoji-Picker im Formular aber nicht mit
  // zurückgeholt, der bei der zwischenzeitlichen TE-157-Iteration (Karten
  // ohne Icon) entfernt wurde. Ohne Picker blieb `emoji` seither immer null,
  // neue Countdowns bekamen nur noch den Fallback 💛 aus CountdownCard.
  const handleSave = useCallback(async () => {
    const title = titleDraft.trim();
    if (!title || !dateDraft || !uid || !familyId) return;
    const isoDate = `${dateDraft.getFullYear()}-${String(dateDraft.getMonth() + 1).padStart(2, '0')}-${String(dateDraft.getDate()).padStart(2, '0')}`;
    setBusy(true);
    try {
      if (editing) {
        await updateCountdown(familyId, uid, editing.id, { title, targetDate: isoDate, emoji: emojiDraft });
      } else {
        await addCountdown(familyId, uid, title, isoDate, emojiDraft);
      }
      setFormVisible(false);
    } catch {
    } finally {
      setBusy(false);
    }
  }, [editing, titleDraft, dateDraft, emojiDraft, uid, familyId]);

  const handleDelete = useCallback(async () => {
    if (!editing || !uid || !familyId) return;
    setBusy(true);
    try {
      await deleteCountdown(familyId, uid, editing.id);
      setFormVisible(false);
    } catch {
    } finally {
      setBusy(false);
    }
  }, [editing, uid, familyId]);

  const accent = colors.accentNeon;
  const canSave = titleDraft.trim().length > 0 && !!dateDraft && !busy;

  if (!familyId) return null;

  return (
    <View style={styles.wrap}>
      {loadError ? (
        <View style={styles.errorRow}>
          <Ionicons name="cloud-offline-outline" size={15} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>
            Countdowns können nicht geladen werden – fehlende Firestore-Berechtigung für „countdownsByUser". Bitte Regeln in der Firebase-Konsole prüfen.
          </Text>
        </View>
      ) : items === null ? (
        <ActivityIndicator color={accent} style={{ marginVertical: 10, marginLeft: 16 }} />
      ) : compact ? (
        // TE-161: feste Kartengröße (TE-162: wieder wie am Anfang, 84×84) –
        // die Karten brechen dank flexWrap einfach in weitere Zeilen um,
        // statt horizontal zu scrollen oder in ein starres Spalten-Raster
        // gepresst zu werden.
        <View style={styles.grid}>
          {sorted.map((c) => (
            <CountdownCard key={c.id} countdown={c} colors={colors} onPress={() => openEdit(c)} />
          ))}
          <AddCard colors={colors} onPress={openNew} />
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {sorted.map((c) => (
            <CountdownCard key={c.id} countdown={c} colors={colors} onPress={() => openEdit(c)} />
          ))}
          <AddCard colors={colors} onPress={openNew} />
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

            <Text style={[formStyles_subtitle(colors)]}>
              Gib ein, worauf du dich freust – z. B. „Urlaub" – und bis wann es noch dauert. Das soll motivieren! 💪
            </Text>

            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
              placeholder="z. B. Urlaub"
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
                <Text style={[styles.saveBtnText, { color: colors.accentFg }]}>Speichern</Text>
              </Pressable>
            </View>
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

// TE-162: Kartengröße wieder wie bei der allerersten Umsetzung (TE-128) –
// feste 84×84-Kachel statt aus der Container-Breite abgeleiteter Größe.
const CARD_SIZE = 84;

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  scrollContent: { paddingHorizontal: 16, gap: 10 },
  // TE-161: Grid statt horizontalem Scrollen – die Karten brechen bei vielen
  // Einträgen einfach in weitere Zeilen um.
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 6 },
  errorText: { fontSize: 11, flex: 1, lineHeight: 15 },

  // "Filigran": dünner Rahmen, große Eckenrundung, kein Schatten/Füllfarbe-Wumms.
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 1,
  },
  cardEmoji: { fontSize: 16, marginBottom: 1 },
  cardNumber: { fontSize: 22, fontWeight: '800', lineHeight: 24 },
  cardUnit: { fontSize: 10, marginTop: -2 },
  cardBigLabel: { fontSize: 13, fontWeight: '800' },
  cardTitle: { fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 2 },

  addCard: { borderStyle: 'dashed', gap: 4 },
  addCardText: { fontSize: 10, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  formCard: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 18 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formTitle: { fontSize: 16, fontWeight: '800' },

  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },

  emojiRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  emojiChip: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  emojiChipText: { fontSize: 17 },

  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8 },
  dateBtnText: { fontSize: 14 },

  formActions: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deleteBtnText: { fontSize: 13, fontWeight: '700' },
  saveBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  saveBtnText: { fontSize: 14, fontWeight: '800' },
});
