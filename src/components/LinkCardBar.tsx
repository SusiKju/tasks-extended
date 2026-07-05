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

export function LinkCardBar({ colors, compact = false }: { colors: ThemeColors; isDark?: boolean; compact?: boolean }) {
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.row, compact && s.rowCompact]}>
        {active.map((l) => (
          <Pressable
            key={l.id}
            style={({ pressed }) => [s.card, compact && s.cardCompact, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => openLink(l.url)}
          >
            <LinkAvatar link={l} size={compact ? 24 : 30} />
            {/* TE-153: im kompakten Modus (schmale Dashboard-Spalte) nur das Icon –
                das Label entfällt, da das Icon den Link bereits eindeutig zeigt. */}
            {!compact && (
              <Text style={[s.label, { color: colors.textSecondary }]} numberOfLines={1}>{l.title}</Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 16, gap: 8 },
  headerTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  row: { gap: 12, paddingVertical: 2, paddingRight: 8 },
  card: { alignItems: 'center', gap: 3, width: 46 },
  label: { fontSize: 9, fontWeight: '600', textAlign: 'center' },
  // TE-153: kompakte Variante für die schmale Dashboard-Spalte – kleinere Icons,
  // schmalere Karten, damit mehr Links ohne Abschneiden hineinpassen.
  rowCompact: { gap: 10 },
  cardCompact: { width: 34 },
});
