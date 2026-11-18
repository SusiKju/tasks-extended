/**
 * Fernsehzeit-Alarm auf dem Dashboard: Alle Kinder, die diese Woche bei 0 Minuten
 * stehen oder überzogen haben, in einer einzigen schmalen roten Zeile – damit beide Eltern wissen, dass
 * das Kind diese Woche nicht mehr fernsehen darf. Der Filmabend am Freitag
 * zählt nicht zur Fernsehzeit. Antippen öffnet den Kinderplan.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
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

  // Kompakt: alle betroffenen Kinder in EINER schmalen roten Zeile statt
  // einer Karte pro Kind – das Dashboard soll ohne Scrollen überblickbar bleiben.
  const label = items
    .map(({ child, rest }) => `${child.name} ${rest < 0 ? `um ${tvText(-rest)} überzogen` : 'aufgebraucht'}`)
    .join(', ');

  return (
    <Pressable
      style={({ pressed }) => [styles.bar, { opacity: pressed ? 0.6 : 1 }]}
      onPress={() => router.push('/(tabs)/kinder-plan' as any)}
      accessibilityRole="button"
      accessibilityLabel={`Fernsehzeit: ${label}. Diese Woche kein Fernsehen mehr, Filmabend am Freitag ausgenommen`}
    >
      <Ionicons name="tv-outline" size={16} color={TV_ROT} />
      <Text style={styles.text} numberOfLines={1}>
        <Text style={styles.head}>Kein TV </Text>
        {items.map(({ child, rest }, i) => (
          <Text key={child.id}>
            {i > 0 ? <Text style={styles.sep}> · </Text> : null}
            <Text style={{ color: childColor(child.id), fontWeight: '700' }}>{child.name}</Text>
            {rest < 0 ? <Text style={styles.over}> −{tvText(-rest)}</Text> : null}
          </Text>
        ))}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={TV_ROT} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 999, borderWidth: 1, borderColor: TV_ROT,
    backgroundColor: 'rgba(255,59,48,0.12)',
  },
  text: { flex: 1, minWidth: 0, fontSize: 13, color: '#e5e5e7' },
  head: { color: TV_ROT, fontWeight: '800' },
  sep: { color: '#8a8a8a' },
  over: { color: TV_ROT, fontWeight: '600' },
});
