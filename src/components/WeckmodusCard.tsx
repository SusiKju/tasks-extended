/**
 * WeckmodusCard.tsx (TE-82)
 *
 * Zeigt morgens zwischen 5:00 und 10:00 Uhr an Schultagen (Mo-Fr) pro Kind, ob
 * die 1. Stunde stattfindet (aufstehen) oder frei ist (ausschlafen). Kinder
 * ohne jemals eingetragenen Stundenplan werden ausgeblendet – für sie gibt es
 * keine Datenbasis für eine Aussage.
 *
 * Kein Ferienkalender vorhanden: "Schultag" ist hier nur Mo-Fr (todayDayIndex),
 * echte Schulferien werden nicht erkannt.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors, SOFT_BORDER } from '../utils/theme';
import { useFamily } from '../hooks/useFamily';
import {
  TimetableMap, key, todayDayIndex, isBiweeklyActiveWeek, needsWakeUp, subscribeToTimetable,
} from '../services/timetable';

function inWakeWindow(d: Date): boolean {
  return todayDayIndex() !== -1 && d.getHours() >= 5 && d.getHours() < 10;
}

export function WeckmodusCard({ colors }: { colors: ThemeColors }) {
  const { familyId, children } = useFamily();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [timetables, setTimetables] = useState<Record<string, TimetableMap>>({});
  useEffect(() => {
    if (!familyId || children.length === 0) return;
    const unsubs = children.map((c) =>
      subscribeToTimetable(familyId, c.id, (map) =>
        setTimetables((prev) => ({ ...prev, [c.id]: map }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [familyId, children]);

  if (!familyId || !inWakeWindow(now)) return null;

  const todayIdx = todayDayIndex();
  const biweeklyActive = isBiweeklyActiveWeek(now);
  const rows = children
    .filter((c) => Object.keys(timetables[c.id] ?? {}).length > 0)
    .map((c) => ({
      child: c,
      wakeUp: needsWakeUp(timetables[c.id]?.[key(todayIdx, 1)], biweeklyActive),
    }));

  if (rows.length === 0) return null;

  return (
    <View style={[styles.wrap, { borderColor: SOFT_BORDER, backgroundColor: colors.surface }]}>
      <Text style={[styles.windowLabel, { color: colors.textMuted }]}>wird angezeigt von 5–10 Uhr</Text>
      {rows.map(({ child, wakeUp }) => (
        <View key={child.id} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: child.color }]} />
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {child.emoji ? `${child.emoji} ` : ''}{child.name}
          </Text>
          <Ionicons
            name={wakeUp ? 'alarm-outline' : 'moon-outline'}
            size={14}
            color={wakeUp ? colors.accentNeon : colors.textMuted}
          />
          <Text style={[styles.status, { color: wakeUp ? colors.text : colors.textMuted }]} numberOfLines={1}>
            {wakeUp ? '1. Stunde – aufstehen' : '1. Stunde frei – ausschlafen'}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderRadius: 14, padding: 10, gap: 6 },
  windowLabel: { position: 'absolute', top: 6, right: 10, fontSize: 9, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  status: { fontSize: 12, flex: 1 },
});
