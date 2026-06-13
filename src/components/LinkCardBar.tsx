/**
 * LinkCardBar.tsx
 *
 * Schnellleiste der aktivierten Links – horizontal scrollbare Icon-Karten
 * oberhalb der Geistesblitze (TE-32). Erscheint nur, wenn mindestens ein Link
 * aktiv ist. Klick auf eine Karte öffnet die URL.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { ThemeColors } from '../utils/theme';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useFamily } from '../hooks/useFamily';
import { LinkItem, subscribeToLinks, openLink } from '../services/links';
import { LinkAvatar } from './LinkAvatar';

export function LinkCardBar({ colors }: { colors: ThemeColors; isDark?: boolean }) {
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {active.map((l) => (
          <Pressable
            key={l.id}
            style={({ pressed }) => [s.card, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => openLink(l.url)}
          >
            <LinkAvatar link={l} size={52} />
            <Text style={[s.label, { color: colors.textSecondary }]} numberOfLines={1}>{l.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 16, gap: 8 },
  headerTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  row: { gap: 14, paddingVertical: 2, paddingRight: 8 },
  card: { alignItems: 'center', gap: 4, width: 60 },
  label: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
});
