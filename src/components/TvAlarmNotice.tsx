/**
 * Fernsehzeit-Alarm auf dem Dashboard, im Stil der Noten-Karte (NewGradesNotice):
 * EINE Karte für alle Kinder, die diese Woche bei 0 Minuten stehen oder überzogen
 * haben. Zugeklappt: überlappende Kreise (Rand in Kinderfarbe, Inhalt "−5" bzw. "0")
 * plus Namen. Antippen klappt die Details pro Kind auf; der Pfeil-Button springt
 * in den Kinderplan. Der Filmabend am Freitag zählt nicht zur Fernsehzeit.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cardEdge, useTheme } from '../utils/theme';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChildConfig } from '../services/family';
import { subscribeRegeln, subscribeWoche } from '../services/kinderPlan';
import {
  DEFAULT_REGELN, KinderRegeln, KinderWoche, TV_ROT, tvKontingent, tvRest, tvText, weekKey,
} from '../utils/kinderPlanLogic';

interface Props {
  familyId: string;
  children: ChildConfig[];
  childColor: (id: string) => string;
}

export function TvAlarmNotice({ familyId, children, childColor }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [regeln, setRegeln] = useState<KinderRegeln>(DEFAULT_REGELN);
  const [woche, setWoche] = useState<KinderWoche | null>(null);
  const wk = weekKey();

  useEffect(() => (familyId ? subscribeRegeln(familyId, setRegeln) : undefined), [familyId]);
  useEffect(() => (familyId ? subscribeWoche(familyId, wk, setWoche) : undefined), [familyId, wk]);

  if (!woche) return null;
  const items = children
    .map((c) => ({ child: c, rest: tvRest(regeln, woche, c), max: tvKontingent(regeln, c) }))
    .filter((x) => x.max > 0 && x.rest <= 0);
  if (items.length === 0) return null;

  const names = items.map((x) => x.child.name);

  return (
    <View style={[styles.card, cardEdge(colors), styles.alarm]}>
      <Pressable
        style={({ pressed }) => [styles.main, { opacity: pressed ? 0.6 : 1 }]}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Fernsehzeit aufgebraucht: ${names.join(', ')}. ${open ? 'Zuklappen' : 'Details anzeigen'}`}
      >
        <View style={styles.badges}>
          {items.slice(0, MAX_BADGES).map(({ child, rest }, i) => (
            <View key={child.id} style={[styles.badge, { borderColor: childColor(child.id) }, i > 0 && styles.badgeOverlap]}>
              <Text style={[styles.badgeText, rest < 0 && { color: TV_ROT }]} numberOfLines={1}>{badgeText(rest)}</Text>
            </View>
          ))}
          {items.length > MAX_BADGES && (
            <View style={[styles.badge, styles.badgeOverlap, { borderColor: TV_ROT }]}>
              <Text style={styles.badgeText}>+{items.length - MAX_BADGES}</Text>
            </View>
          )}
        </View>
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1}>
            <Text style={{ color: TV_ROT }}>Kein TV mehr</Text>
            {' · '}
            {items.map(({ child }, i) => (
              <Text key={child.id} style={{ color: childColor(child.id) }}>{i > 0 ? ', ' : ''}{child.name}</Text>
            ))}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>Diese Woche · Filmabend am Freitag ausgenommen</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#8a8a8a" />
      </Pressable>

      {open && (
        <View style={styles.details}>
          {items.map(({ child, rest, max }) => (
            <View key={child.id} style={styles.row}>
              <View style={[styles.badge, styles.badgeSmall, { borderColor: childColor(child.id) }]}>
                <Text style={[styles.badgeTextSmall, rest < 0 && { color: TV_ROT }]} numberOfLines={1}>{badgeText(rest)}</Text>
              </View>
              <Text style={styles.rowText} numberOfLines={1}>
                <Text style={{ color: childColor(child.id), fontWeight: '700' }}>{child.name}</Text>
                <Text style={{ color: TV_ROT }}>{rest < 0 ? `  ${tvText(-rest)} überzogen` : '  aufgebraucht'}</Text>
                <Text style={styles.sub}>{`  · ${tvText(max - rest)} von ${tvText(max)}`}</Text>
              </Text>
            </View>
          ))}
          <Pressable
            style={({ pressed }) => [styles.jump, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => router.push('/(tabs)/kinder-plan' as any)}
            accessibilityRole="button"
            accessibilityLabel="Zum Kinderplan"
            hitSlop={6}
          >
            <Text style={styles.jumpText}>Zum Kinderplan</Text>
            <Ionicons name="arrow-forward" size={14} color="#d0d0d0" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Kreis-Inhalt: überzogene Minuten als "−5", aufgebraucht als "0". */
function badgeText(rest: number): string {
  return rest < 0 ? `−${-rest}` : '0';
}

const MAX_BADGES = 4;
const BADGE = 30;
const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    paddingVertical: 8, paddingLeft: 10, paddingRight: 10,
    borderWidth: 1,
  },
  alarm: { borderColor: TV_ROT, borderLeftWidth: 3 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badges: { flexDirection: 'row' },
  badge: {
    minWidth: BADGE, height: BADGE, borderRadius: BADGE / 2, borderWidth: 2, paddingHorizontal: 3,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#161a24', // deckend: überlappt
  },
  badgeOverlap: { marginLeft: -8 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  badgeSmall: { minWidth: 24, height: 24, borderRadius: 12, borderWidth: 1.5 },
  badgeTextSmall: { color: '#fff', fontSize: 10, fontWeight: '900' },
  texts: { flex: 1, minWidth: 0, gap: 1 },
  title: { color: '#e5e5e7', fontSize: 13, fontWeight: '600' },
  sub: { color: '#8a8a8a', fontSize: 12 },
  details: {
    marginTop: 8, paddingTop: 8, gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#3a3a3c',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { flex: 1, minWidth: 0, fontSize: 13 },
  jump: {
    alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 30, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#3a3a3c',
    marginTop: 2,
  },
  jumpText: { color: '#d0d0d0', fontSize: 12, fontWeight: '600' },
});
