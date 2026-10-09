/**
 * TE-52: Dezenter Hinweis auf neue Noten (Variante E) oberhalb der Heute-Karte.
 * Pro Kind mit ungelesenen beste.schule-Noten eine schmale Karte: Noten als
 * Abzeichen in der Kinderfarbe, Kurztext, „Gelesen“ (= ackGrades, familienweit).
 * Antippen öffnet den Schule-Tab direkt auf den Noten des Kindes.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CARD_EDGE } from '../utils/theme';
import { ChildConfig } from '../services/family';
import {
  GradeEntry, GradesMap, ackGrades, gradeColor, gradeId, subscribeToGrades, subscribeToGradesAck, unreadGradeIds,
} from '../services/grades';

interface Props {
  familyId: string;
  children: ChildConfig[];
  childColor: (id: string) => string;
}

const MAX_BADGES = 3;

function dateLabel(g: GradeEntry): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(g.date ?? ''));
  return m ? `${m[3]}.${m[2]}.` : null;
}

export function NewGradesNotice({ familyId, children, childColor }: Props) {
  const [grades, setGrades] = useState<Record<string, GradesMap>>({});
  const [acks, setAcks] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!familyId) return;
    const unsubs = children.flatMap((c) => [
      subscribeToGrades(familyId, c.id, (m) => setGrades((p) => ({ ...p, [c.id]: m }))),
      subscribeToGradesAck(familyId, c.id, (ids) => setAcks((p) => ({ ...p, [c.id]: ids }))),
    ]);
    return () => unsubs.forEach((u) => u());
  }, [familyId, children]);

  const items = useMemo(() => children.flatMap((c) => {
    const map = grades[c.id] ?? {};
    const unread = new Set(unreadGradeIds(map, acks[c.id] ?? []));
    if (unread.size === 0) return [];
    const list = Object.entries(map)
      .flatMap(([fach, entries]) => entries.map((g) => ({ fach, g })))
      .filter(({ g }) => unread.has(gradeId(g) ?? ''))
      .sort((a, b) => String(b.g.date ?? '').localeCompare(String(a.g.date ?? '')));
    return [{ child: c, ids: [...unread], list }];
  }), [children, grades, acks]);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {items.map(({ child, ids, list }) => {
        const color = childColor(child.id);
        const single = list.length === 1 ? list[0] : null;
        const title = single ? single.fach : `${list.length} neu`;
        const sub = single
          ? [single.g.type, dateLabel(single.g)].filter(Boolean).join(' · ')
          : [...new Set(list.map((x) => x.fach))].join(' · ');
        return (
          <View key={child.id} style={styles.card}>
            <Pressable
              style={({ pressed }) => [styles.main, { opacity: pressed ? 0.6 : 1 }]}
              onPress={() => router.push({ pathname: '/(tabs)/schule', params: { child: child.id, view: 'noten' } } as any)}
              accessibilityLabel={`Neue Noten für ${child.name} anzeigen`}
            >
              <View style={styles.badges}>
                {list.slice(0, MAX_BADGES).map(({ g }, i) => (
                  <View key={i} style={[styles.badge, { borderColor: gradeColor(g.value) ?? color }, i > 0 && styles.badgeOverlap]}>
                    <Text style={styles.badgeText} numberOfLines={1}>{g.value}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.texts}>
                <Text style={styles.title} numberOfLines={1}>
                  <Text style={{ color }}>{child.name}</Text> · {title}
                </Text>
                {!!sub && <Text style={styles.sub} numberOfLines={1}>{sub}</Text>}
              </View>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.readBtn, { opacity: pressed ? 0.6 : 1 }]}
              onPress={() => { ackGrades(familyId, child.id, ids).catch(() => {}); }}
              hitSlop={6}
            >
              <Text style={styles.readText}>Gelesen</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const BADGE = 30;
const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingLeft: 10, paddingRight: 8, borderRadius: 14,
    borderWidth: 1, ...CARD_EDGE,
  },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  badges: { flexDirection: 'row' },
  badge: {
    minWidth: BADGE, height: BADGE, borderRadius: BADGE / 2, borderWidth: 2, paddingHorizontal: 3,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#161a24', // deckend: überlappt
  },
  badgeOverlap: { marginLeft: -8 },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  texts: { flex: 1, minWidth: 0, gap: 1 },
  title: { color: '#e5e5e7', fontSize: 13, fontWeight: '600' },
  sub: { color: '#8a8a8a', fontSize: 12 },
  readBtn: {
    height: 30, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#3a3a3c',
    alignItems: 'center', justifyContent: 'center',
  },
  readText: { color: '#d0d0d0', fontSize: 12, fontWeight: '600' },
});
