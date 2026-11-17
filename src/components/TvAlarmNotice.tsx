/**
 * Fernsehzeit-Alarm auf dem Dashboard: Pro Kind, das diese Woche bei 0 Minuten
 * steht oder überzogen hat, eine rote Karte – damit beide Eltern wissen, dass
 * das Kind diese Woche nicht mehr fernsehen darf. Der Filmabend am Freitag
 * zählt nicht zur Fernsehzeit. Antippen öffnet den Kinderplan.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { cardEdge, useTheme } from '../utils/theme';
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

  return (
    <View style={styles.wrap}>
      {items.map(({ child, rest }) => (
        <Pressable
          key={child.id}
          style={({ pressed }) => [styles.card, cardEdge(colors), styles.alarm, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.push('/(tabs)/kinder-plan' as any)}
          accessibilityLabel={`${child.name}: Fernsehzeit ${rest < 0 ? `um ${tvText(-rest)} überzogen` : 'aufgebraucht'}, diese Woche kein Fernsehen mehr`}
        >
          <Ionicons name={rest < 0 ? 'alert-circle' : 'tv-outline'} size={26} color={TV_ROT} />
          <View style={styles.texts}>
            <Text style={styles.title} numberOfLines={1}>
              <Text style={{ color: childColor(child.id) }}>{child.name}</Text>
              {' · '}
              <Text style={{ color: TV_ROT }}>{rest < 0 ? `${tvText(-rest)} überzogen` : 'Fernsehzeit aufgebraucht'}</Text>
            </Text>
            <Text style={styles.sub} numberOfLines={2}>Diese Woche kein Fernsehen mehr · Filmabend am Freitag ausgenommen</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1,
  },
  alarm: { borderColor: TV_ROT, borderLeftWidth: 4 },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: '#e5e5e7', fontSize: 14, fontWeight: '700' },
  sub: { color: '#8a8a8a', fontSize: 12 },
});
