/**
 * LinkCardBar.tsx
 *
 * Schnellleiste der aktivierten Links – große Icon-Karten am Fuß des
 * Dashboards (TE-161: über die volle Breite, bricht bei vielen Einträgen
 * einfach um statt horizontal zu scrollen). Erscheint nur, wenn mindestens
 * ein Link aktiv ist. Klick auf eine Karte öffnet die URL.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { ThemeColors } from '../utils/theme';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useFamily } from '../hooks/useFamily';
import { LinkItem, subscribeToLinks, openLink } from '../services/links';
import { LinkAvatar } from './LinkAvatar';

export function LinkCardBar({ colors }: { colors: ThemeColors }) {
  const { user } = useFirebaseAuth();
  const { familyId } = useFamily();
  const [links, setLinks] = useState<LinkItem[]>([]);

  const fid = familyId ?? '';
  const uid = user?.uid ?? '';

  useEffect(() => {
    if (!fid || !uid) return;
    return subscribeToLinks(fid, uid, setLinks);
  }, [fid, uid]);

  const active = links.filter((l) => l.active);
  // Nur bei mindestens einem aktiven Link sichtbar (Produktentscheidung TE-32).
  if (active.length === 0) return null;

  return (
    <View style={s.section}>
      <Text style={[s.headerTitle, { color: colors.textSecondary }]}>LINKS</Text>
      <View style={s.row}>
        {active.map((l) => (
          <Pressable
            key={l.id}
            style={({ pressed }) => [s.card, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => openLink(l.url)}
          >
            <LinkAvatar link={l} size={44} />
            <Text style={[s.label, { color: colors.textSecondary }]} numberOfLines={1}>{l.title}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 16, gap: 10 },
  headerTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingVertical: 2 },
  card: { alignItems: 'center', gap: 5, width: 68 },
  label: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
