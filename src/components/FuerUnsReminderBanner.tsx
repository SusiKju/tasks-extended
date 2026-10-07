/**
 * FuerUnsReminderBanner.tsx (TE-55, Karte seit TE-5)
 *
 * Dashboard-Karte "Für uns". Alles darin geht mit einem Tipp, ohne Umweg über
 * den Tab. Drei Zustände, von oben nach unten geprüft:
 *   A  ungelesene Nachricht vom Partner → steht direkt da, Antwort-Kombos
 *      (bzw. Reaktionen bei Nachrichten ohne Kombo) markieren sie als gelesen
 *   B  nichts offen, Barometer heute noch nicht gesetzt → Skala; darunter
 *      dezent „… etwas schreiben ›“, solange ich heute nichts geschickt habe
 *   C  sonst → eine Zeile mit beiden Barometer-Ständen
 * Das Lust-Barometer erscheint, solange ich heute noch keinen Wert gesetzt habe.
 * Bewusst ruhig gehalten (kein Pulsieren wie die Geburtstags-Card).
 */

import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { ThemeColors } from '../utils/theme';
import { useFuerUns } from '../hooks/useFuerUns';
import {
  FUER_UNS_REPLIES,
  FUER_UNS_REACTIONS,
  FUER_UNS_MOOD_LEVELS,
  FuerUnsItem,
  addFuerUnsMessage,
  setFuerUnsReaction,
  setFuerUnsReadState,
  setFuerUnsMood,
  unreadFromPartner,
  fuerUnsComboLabel,
} from '../services/fuerUns';

const ACCENT = '#E8607A';

export function FuerUnsReminderBanner({
  colors,
  fuerUns,
}: {
  colors: ThemeColors;
  fuerUns: ReturnType<typeof useFuerUns>;
}) {
  const router = useRouter();
  const { familyId, myUid, myName, items, sentToday, myMood, partnerMood, partnerName } = fuerUns;
  const [moodOpen, setMoodOpen] = useState(false);
  // Welchen Barometer-Stand des Partners habe ich schon gesehen? Neuer Stand → „NEU“, bis ich draufgetippt habe.
  const seenKey = `fuerUnsPartnerMoodSeen:${myUid}`;
  const [seenAt, setSeenAt] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!myUid) return;
    AsyncStorage.getItem(seenKey).then(setSeenAt).catch(() => setSeenAt(null));
  }, [seenKey, myUid]);

  if (!familyId || !myUid || !myName) return null;

  const unread = unreadFromPartner(items, myUid)[0] as FuerUnsItem | undefined;
  const replies = unread?.emoji ? FUER_UNS_REPLIES[unread.emoji] : undefined;
  const showMood = !myMood || moodOpen;
  const partner = partnerName ?? 'Partner';
  const openTab = () => router.push('/(tabs)/fuer-uns' as any);

  const send = async (emoji: string) => {
    try { await addFuerUnsMessage(familyId, '', myName, myUid, emoji); } catch {}
  };
  const reply = async (emoji: string) => {
    if (!unread) return;
    await send(emoji);
    setFuerUnsReadState(familyId, unread.id, true).catch(() => {});
  };
  const react = (emoji: string) => {
    if (!unread) return;
    setFuerUnsReaction(familyId, unread.id, { emoji, by: myName, byUid: myUid }).catch(() => {});
    setFuerUnsReadState(familyId, unread.id, true).catch(() => {});
  };
  const pickMood = (level: number) => {
    setMoodOpen(false);
    setFuerUnsMood(familyId, myUid, level).catch(() => {});
  };

  const partnerIsNew = !!partnerMood && seenAt !== undefined && seenAt !== partnerMood.updatedAt;
  const markPartnerSeen = () => {
    if (!partnerMood) return;
    setSeenAt(partnerMood.updatedAt);
    AsyncStorage.setItem(seenKey, partnerMood.updatedAt).catch(() => {});
  };

  // Stand des Partners: eigene, gut sichtbare Zeile; ungesehene Änderung gefüllt + „NEU“.
  const partnerPill = partnerMood && (
    <Pressable
      onPress={markPartnerSeen}
      style={[styles.partnerPill, {
        borderColor: partnerIsNew ? ACCENT : ACCENT + '55',
        backgroundColor: partnerIsNew ? ACCENT + '33' : colors.surface,
      }]}
    >
      <Text style={styles.partnerEmoji}>{FUER_UNS_MOOD_LEVELS[partnerMood.level].emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.partnerWho, { color: colors.textMuted }]}>{partner} ist heute</Text>
        <Text style={[styles.partnerLevel, { color: colors.text }]}>{FUER_UNS_MOOD_LEVELS[partnerMood.level].label}</Text>
      </View>
      {partnerIsNew ? (
        <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEU</Text></View>
      ) : (
        <Text style={[styles.partnerTime, { color: colors.textMuted }]}>seit {format(parseISO(partnerMood.updatedAt), 'HH:mm')}</Text>
      )}
    </Pressable>
  );

  const myMoodLink = myMood && (
    <Pressable onPress={() => setMoodOpen((v) => !v)} hitSlop={6}>
      <Text style={[styles.moodText, { color: colors.textMuted }]}>Du: {FUER_UNS_MOOD_LEVELS[myMood.level].emoji} {FUER_UNS_MOOD_LEVELS[myMood.level].label}</Text>
    </Pressable>
  );

  // C: nichts offen, Barometer gesetzt → eine Zeile
  if (!unread && !showMood) {
    return (
      <View style={[styles.card, { backgroundColor: ACCENT + '12', borderColor: ACCENT + '40' }]}>
        {partnerPill}
        <View style={styles.compact}>
          <Ionicons name="heart" size={14} color={ACCENT} />
          <View style={{ flex: 1 }}>{myMoodLink}</View>
          <Pressable onPress={openTab} hitSlop={6}>
            <Text style={[styles.link, { color: colors.textMuted }]}>{sentToday ? 'Für uns ›' : `${partner} schreiben ›`}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: ACCENT + '18', borderColor: ACCENT + '55' }]}>
      <Pressable onPress={openTab} style={styles.header} hitSlop={4}>
        <Ionicons name="heart-outline" size={16} color={ACCENT} />
        <Text style={[styles.title, { color: colors.text }]}>Für uns</Text>
        <View style={{ flex: 1 }} />
        {myMoodLink}
      </Pressable>

      {partnerPill}

      {/* A: ungelesene Nachricht vom Partner */}
      {unread && (
        <>
          <Pressable onPress={openTab} style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.bubbleText, { color: colors.text }]} numberOfLines={3}>
              {[unread.emoji, unread.text || fuerUnsComboLabel(unread.emoji)].filter(Boolean).join(' ')}
            </Text>
          </Pressable>
          <View style={styles.chips}>
            {replies
              ? replies.map((r) => (
                  <Pressable key={r.emoji} onPress={() => reply(r.emoji)} style={({ pressed }) => [styles.chip, { borderColor: ACCENT, backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 }]}>
                    <Text style={[styles.chipText, { color: colors.text }]}>{r.emoji} {r.label}</Text>
                  </Pressable>
                ))
              : FUER_UNS_REACTIONS.map((r) => (
                  <Pressable key={r} onPress={() => react(r)} style={({ pressed }) => [styles.chip, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 }]}>
                    <Text style={styles.chipEmoji}>{r}</Text>
                  </Pressable>
                ))}
          </View>
        </>
      )}

      {/* Lust-Barometer: ein Tipp, gilt nur für heute */}
      {showMood && (
        <View style={{ gap: 4 }}>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Stimmungsbarometer</Text>
          <View style={styles.scale}>
            {FUER_UNS_MOOD_LEVELS.map((m, i) => {
              const on = myMood?.level === i;
              return (
                <Pressable
                  key={m.label}
                  onPress={() => pickMood(i)}
                  style={[styles.scaleBtn, { borderColor: on ? ACCENT : colors.border, backgroundColor: on ? ACCENT + '22' : colors.surface }]}
                >
                  <Text style={styles.scaleEmoji}>{m.emoji}</Text>
                  <Text style={[styles.scaleLabel, { color: on ? colors.text : colors.textMuted }]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Dezenter Hinweis statt Kombo-Vorschlag: Antippen führt zum Schreiben. */}
      {!unread && !sentToday && (
        <Pressable onPress={openTab} hitSlop={6} style={styles.writeHint}>
          <Text style={[styles.writeHintText, { color: colors.textMuted }]}>{partner} etwas schreiben ›</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 4,
    marginTop: 2,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 9,
  },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partnerPill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  partnerEmoji: { fontSize: 24 },
  partnerWho: { fontSize: 11.5 },
  partnerLevel: { fontSize: 15, fontWeight: '800' },
  partnerTime: { fontSize: 11 },
  newBadge: { backgroundColor: ACCENT, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  newBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 13, fontWeight: '700' },
  link: { fontSize: 12, fontWeight: '700' },
  sub: { fontSize: 11.5 },
  moodText: { fontSize: 12 },
  bubble: { borderWidth: 1, borderRadius: 12, borderBottomLeftRadius: 3, paddingHorizontal: 11, paddingVertical: 8 },
  bubbleText: { fontSize: 13.5, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipEmoji: { fontSize: 15 },
  writeHint: { alignSelf: 'flex-end' },
  writeHintText: { fontSize: 11.5 },
  scaleLabel: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
  scale: { flexDirection: 'row', gap: 6 },
  scaleBtn: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 5 },
  scaleEmoji: { fontSize: 18 },
});
