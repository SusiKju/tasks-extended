/**
 * FuerUnsReminderBanner.tsx (TE-55, seit TE-17 eine Zeile)
 *
 * Dashboard-Zeile "Für uns": nur das, was man im Vorbeigehen wissen will –
 * Stimmung des Partners (🌸 bei Pause, „NEU“ bei ungesehener Änderung), die
 * eigene Stimmung („?“ wenn noch nicht gesetzt), Zahl ungelesener Nachrichten.
 * Sind beide heute bei Lust/Heiß, leuchtet die Zeile: „Ihr seid euch heute einig“.
 * Alles Weitere (Skala, Antworten, Pause, Vorschläge) liegt im Tab; ein Tipp
 * auf die Zeile öffnet ihn. Bewusst so flach wie eine Termin-Zeile.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ThemeColors } from '../utils/theme';
import { useFuerUns } from '../hooks/useFuerUns';
import { format, formatDistanceToNow, isToday, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { addFuerUnsMessage, setFuerUnsMood, FUER_UNS_MOOD_LEVELS, FUER_UNS_LAST_SEEN_VIEWER } from '../services/fuerUns';

const ACCENT = '#E8607A';
// Eigene Bordeaux-Farbwelt, fest (nicht über mono()), damit die Zeile in jedem Theme als „Für uns“ erkennbar bleibt.
const WINE = '#3a0f1f';
const WINE_BORDER = '#9b2f55';
const WINE_GLOW = '#6b1a36';
const TEXT = '#f4ecee';
const MUTED = '#c9a9b3';
/** Ab dieser Stufe (😏 Lust) zählt es als Lust. */
const LUST_LEVEL = 3;
/** Liebes Nein aus FUER_UNS_REPLIES. */
const SOFT_NO = '💭🤍';

export function FuerUnsReminderBanner({
  fuerUns,
}: {
  colors: ThemeColors;
  fuerUns: ReturnType<typeof useFuerUns>;
}) {
  const router = useRouter();
  const { familyId, myName, items, myUid, myMood, partnerMood, myPause, partnerPause, partnerName, unreadCount, partnerLastSeenAt } = fuerUns;

  // Welchen Barometer-Stand des Partners habe ich schon gesehen? Neuer Stand → „NEU“, bis ich die Zeile antippe.
  const seenKey = `fuerUnsPartnerMoodSeen:${myUid}`;
  const [seenAt, setSeenAt] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!myUid) return;
    AsyncStorage.getItem(seenKey).then(setSeenAt).catch(() => setSeenAt(null));
  }, [seenKey, myUid]);

  if (!myUid) return null;

  const partner = partnerName ?? 'Partner';
  const partnerIsNew = !!partnerMood?.updatedAt && seenAt !== undefined && seenAt !== partnerMood.updatedAt;
  const einig = !myPause && !partnerPause
    && (myMood?.level ?? -1) >= LUST_LEVEL && (partnerMood?.level ?? -1) >= LUST_LEVEL;

  // Variante D (TE-20): Partner hat Lust, ich noch nicht → direkt in der Zeile antworten.
  // „Heute nicht“ gilt als beantwortet, sobald ich nach seinem Stand ein 💭🤍 geschickt habe.
  const declined = !!partnerMood?.updatedAt && items.some(
    (i) => i.addedByUid === myUid && i.emoji === SOFT_NO && i.createdAt > partnerMood.updatedAt!
  );
  const askBack = !einig && !partnerPause && !myPause && !declined
    && (partnerMood?.level ?? -1) >= LUST_LEVEL && (myMood?.level ?? -1) < LUST_LEVEL;
  const sayYes = () => { if (familyId) setFuerUnsMood(familyId, myUid, LUST_LEVEL).catch(() => {}); };
  const sayNo = () => { if (familyId && myName) addFuerUnsMessage(familyId, '', myName, myUid, SOFT_NO).catch(() => {}); };

  const open = () => {
    if (partnerMood?.updatedAt) {
      setSeenAt(partnerMood.updatedAt);
      AsyncStorage.setItem(seenKey, partnerMood.updatedAt).catch(() => {});
    }
    router.push('/(tabs)/fuer-uns' as any);
  };

  const partnerEmoji = partnerPause ? '🌸' : partnerMood ? FUER_UNS_MOOD_LEVELS[partnerMood.level!].emoji : null;
  const myEmoji = myPause ? '🌸' : myMood ? FUER_UNS_MOOD_LEVELS[myMood.level!].emoji : '?';

  // TE-31: nur in meinem Account – wann der Partner zuletzt in der App war.
  const showLastSeen = myUid === FUER_UNS_LAST_SEEN_VIEWER;
  const lastSeen = showLastSeen && partnerLastSeenAt ? parseISO(partnerLastSeenAt) : null;

  return (
    <>
    {askBack ? (
      <Pressable onPress={open} style={({ pressed }) => [styles.strip, styles.hot, { opacity: pressed ? 0.85 : 1 }]}>
        <Text style={styles.bigEmoji}>{FUER_UNS_MOOD_LEVELS[partnerMood!.level!].emoji}</Text>
        <Text style={[styles.title, styles.hotTitle]} numberOfLines={1}>{partner} hat Lust</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={sayYes} hitSlop={4} style={({ pressed }) => [styles.btn, styles.btnYes, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={styles.btnText} numberOfLines={1}>Ich auch</Text>
        </Pressable>
        <Pressable onPress={sayNo} hitSlop={4} style={({ pressed }) => [styles.btn, styles.btnNo, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.btnText, { color: MUTED }]} numberOfLines={1}>Heute nicht</Text>
        </Pressable>
      </Pressable>
    ) : (
    <Pressable
      onPress={open}
      style={({ pressed }) => [
        styles.strip,
        { backgroundColor: einig ? WINE_GLOW : WINE, borderColor: einig ? '#ff8fab' : WINE_BORDER, opacity: pressed ? 0.8 : 1 },
        einig && styles.glow,
      ]}
    >
      <Text style={styles.icon}>❤️‍🔥</Text>
      <Text style={styles.title} numberOfLines={1}>{einig ? 'Ihr seid euch heute einig' : 'Für uns'}</Text>
      {unreadCount > 0 && (
        <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></View>
      )}
      <View style={{ flex: 1 }} />
      {einig ? (
        <Text style={styles.value}>
          {FUER_UNS_MOOD_LEVELS[partnerMood!.level!].emoji} + {FUER_UNS_MOOD_LEVELS[myMood!.level!].emoji}
        </Text>
      ) : (
        <>
          {partnerEmoji && (
            <Text style={styles.value} numberOfLines={1}>{partner} {partnerEmoji}</Text>
          )}
          {partnerIsNew && !partnerPause && (
            <View style={styles.badge}><Text style={styles.badgeText}>NEU</Text></View>
          )}
          <Text style={styles.muted}>{partnerEmoji ? ' · ' : ''}Du {myEmoji}</Text>
        </>
      )}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
    )}
    {showLastSeen && (
      <Text style={styles.lastSeen}>
        {lastSeen
          ? `${partner} zuletzt online ${formatDistanceToNow(lastSeen, { addSuffix: true, locale: de })} · ${format(lastSeen, isToday(lastSeen) ? 'HH:mm' : 'dd.MM. HH:mm')}`
          : `${partner}: noch nicht online seit dem Update`}
      </Text>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 4,
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  glow: { shadowColor: ACCENT, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  icon: { fontSize: 15 },
  title: { color: TEXT, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  value: { color: TEXT, fontSize: 13, fontWeight: '600' },
  muted: { color: MUTED, fontSize: 13 },
  chevron: { color: MUTED, fontSize: 16, marginLeft: 2 },
  lastSeen: { color: '#9b7a85', fontSize: 11, marginHorizontal: 28, marginBottom: 4 },
  hot: { backgroundColor: '#5a1630', borderColor: '#ff8fab' },
  bigEmoji: { fontSize: 17 },
  hotTitle: { fontWeight: '800', color: '#fff' },
  btn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  btnYes: { borderColor: '#ffb3c4', backgroundColor: ACCENT },
  btnNo: { borderColor: MUTED + '66' },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  badge: { backgroundColor: ACCENT, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
});
