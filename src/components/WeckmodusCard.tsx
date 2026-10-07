/**
 * WeckmodusCard.tsx (TE-82)
 *
 * Zeigt morgens zwischen 5:00 und 7:00 Uhr an Schultagen (Mo-Fr) pro Kind, ob
 * die 1. Stunde stattfindet (aufstehen) oder frei ist (ausschlafen; mehrere
 * freie Stunden am Stück werden zusammengezählt, TE-9). Kinder
 * ohne jemals eingetragenen Stundenplan werden ausgeblendet – für sie gibt es
 * keine Datenbasis für eine Aussage.
 *
 * In sächsischen Schulferien und an Feiertagen bleibt die Karte aus (TE-8,
 * isSchulfrei).
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors, SOFT_BORDER } from '../utils/theme';
import { useFamily } from '../hooks/useFamily';
import {
  TimetableMap, key, todayDayIndex, isBiweeklyActiveWeek, needsWakeUp, subscribeToTimetable,
} from '../services/timetable';
import { isSchulfrei } from '../utils/schulferien';

const LAST_LESSON_NR = 10;

/** Anzahl freier Stunden am Stück ab der 1. Stunde (0 = 1. Stunde findet statt). */
function leadingFreePeriods(map: TimetableMap | undefined, dayIdx: number, biweeklyActive: boolean): number {
  let n = 0;
  while (n < LAST_LESSON_NR && !needsWakeUp(map?.[key(dayIdx, n + 1)], biweeklyActive)) n++;
  return n;
}

function statusText(free: number): string {
  if (free === 0) return '1. Stunde – aufstehen';
  if (free === 1) return '1. Stunde frei – ausschlafen';
  if (free >= LAST_LESSON_NR) return 'kein Unterricht – ausschlafen';
  return `1.–${free}. Stunde frei – ausschlafen`;
}

function inWakeWindow(d: Date): boolean {
  return todayDayIndex() !== -1 && !isSchulfrei(d) && d.getHours() >= 5 && d.getHours() < 7;
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
      free: leadingFreePeriods(timetables[c.id], todayIdx, biweeklyActive),
    }));

  if (rows.length === 0) return null;

  return (
    <View style={[styles.wrap, { borderColor: SOFT_BORDER, backgroundColor: colors.surface }]}>
      <Text style={[styles.windowLabel, { color: colors.textMuted }]}>wird angezeigt von 5–7 Uhr</Text>
      {rows.map(({ child, free }) => {
        const wakeUp = free === 0;
        return (
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
            {statusText(free)}
          </Text>
        </View>
        );
      })}
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
