/**
 * FuerUnsReminderBanner.tsx (TE-55, Karte seit TE-5)
 *
 * Dashboard-Karte "Für uns". Alles darin geht mit einem Tipp, ohne Umweg über
 * den Tab. Drei Zustände, von oben nach unten geprüft:
 *   A  ungelesene Nachricht vom Partner → steht direkt da, Antwort-Kombos
 *      (bzw. Reaktionen bei Nachrichten ohne Kombo) markieren sie als gelesen
 *   B  nichts offen, heute noch nichts geschickt → Kombo-Vorschlag zum Senden
 *   C  alles erledigt → eine Zeile mit beiden Barometer-Ständen
 * Das Lust-Barometer erscheint, solange ich heute noch keinen Wert gesetzt habe.
 * Bewusst ruhig gehalten (kein Pulsieren wie die Geburtstags-Card).
 */

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemeColors } from '../utils/theme';
import { useFuerUns } from '../hooks/useFuerUns';
import {
  FUER_UNS_COMBOS,
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

/** Tagsüber eine liebe Kombo, ab 18 Uhr eine heißere. */
function suggestCombo(exclude?: string): string {
  const hot = FUER_UNS_COMBOS.findIndex((c) => c.emoji === '🎲😈');
  const pool = (new Date().getHours() >= 18 ? FUER_UNS_COMBOS.slice(hot) : FUER_UNS_COMBOS.slice(0, hot))
    .filter((c) => c.emoji !== exclude);
  return pool[Math.floor(Math.random() * pool.length)].emoji;
}

export function FuerUnsReminderBanner({
  colors,
  fuerUns,
}: {
  colors: ThemeColors;
  fuerUns: ReturnType<typeof useFuerUns>;
}) {
  const router = useRouter();
  const { familyId, myUid, myName, items, sentToday, myMood, partnerMood, partnerName } = fuerUns;
  const [suggestion, setSuggestion] = useState(() => suggestCombo());
  const [moodOpen, setMoodOpen] = useState(false);

  if (!familyId || !myUid || !myName) return null;

  const unread = unreadFromPartner(items, myUid)[0] as FuerUnsItem | undefined;
  const replies = unread?.emoji ? FUER_UNS_REPLIES[unread.emoji] : undefined;
  const showMood = !myMood || moodOpen;
  const partner = partnerName?.split(' ')[0] ?? 'Partner';
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

  const moodLine = (partnerMood || myMood) && (
    <View style={styles.moodLine}>
      <Text style={[styles.moodText, { color: colors.textMuted }]}>
        {partnerMood ? `${partner}: ${FUER_UNS_MOOD_LEVELS[partnerMood.level]}` : ''}
        {partnerMood && myMood ? '  ·  ' : ''}
      </Text>
      {myMood && (
        <Pressable onPress={() => setMoodOpen((v) => !v)} hitSlop={6}>
          <Text style={[styles.moodText, { color: colors.textMuted }]}>Du: {FUER_UNS_MOOD_LEVELS[myMood.level]}</Text>
        </Pressable>
      )}
    </View>
  );

  // C: nichts offen, heute schon geschickt, Barometer gesetzt → eine Zeile
  if (!unread && sentToday && !showMood) {
    return (
      <Pressable onPress={openTab} style={[styles.card, styles.compact, { backgroundColor: ACCENT + '12', borderColor: ACCENT + '40' }]}>
        <Ionicons name="heart" size={16} color={ACCENT} />
        <View style={{ flex: 1 }}>{moodLine}</View>
        <Text style={[styles.link, { color: ACCENT }]}>Für uns ›</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: ACCENT + '18', borderColor: ACCENT + '55' }]}>
      <Pressable onPress={openTab} style={styles.header} hitSlop={4}>
        <Ionicons name="heart-outline" size={16} color={ACCENT} />
        <Text style={[styles.title, { color: colors.text }]}>Für uns</Text>
        <View style={{ flex: 1 }} />
        {moodLine}
      </Pressable>

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

      {/* B: nichts offen, heute noch nichts geschickt → Vorschlag mit einem Tipp senden */}
      {!unread && !sentToday && (
        <View style={styles.suggestRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sub, { color: colors.textMuted }]}>Schick {partner} doch</Text>
            <Text style={[styles.suggestText, { color: colors.text }]} numberOfLines={2}>
              {suggestion} {fuerUnsComboLabel(suggestion)}
            </Text>
          </View>
          <Pressable onPress={() => setSuggestion((s) => suggestCombo(s))} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="shuffle" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={() => send(suggestion)} style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={styles.btnText}>Senden</Text>
          </Pressable>
        </View>
      )}

      {/* Lust-Barometer: ein Tipp, gilt nur für heute */}
      {showMood && (
        <View style={{ gap: 4 }}>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Und dir heute?</Text>
          <View style={styles.scale}>
            {FUER_UNS_MOOD_LEVELS.map((m, i) => {
              const on = myMood?.level === i;
              return (
                <Pressable
                  key={m}
                  onPress={() => pickMood(i)}
                  style={[styles.scaleBtn, { borderColor: on ? ACCENT : colors.border, backgroundColor: on ? ACCENT + '22' : colors.surface }]}
                >
                  <Text style={styles.scaleEmoji}>{m}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
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
  compact: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 13, fontWeight: '700' },
  link: { fontSize: 12, fontWeight: '700' },
  sub: { fontSize: 11.5 },
  moodLine: { flexDirection: 'row', alignItems: 'center' },
  moodText: { fontSize: 12 },
  bubble: { borderWidth: 1, borderRadius: 12, borderBottomLeftRadius: 3, paddingHorizontal: 11, paddingVertical: 8 },
  bubbleText: { fontSize: 13.5, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipEmoji: { fontSize: 15 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  suggestText: { fontSize: 13, fontWeight: '700' },
  iconBtn: { padding: 4 },
  btn: { backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  scale: { flexDirection: 'row', gap: 6 },
  scaleBtn: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 5 },
  scaleEmoji: { fontSize: 18 },
});
