/**
 * LinkCardBar.tsx
 *
 * "Schnellzugriff" – eine gemeinsame, horizontal scrollende Zeile aus Links
 * und Drive-Favoriten (Redesign-Auftrag: beide standen vorher getrennt,
 * Links als umbrechendes Grid – TE-161 –, Drive-Favoriten als eigene
 * vertikale Liste. Nutzer hat die Zusammenlegung trotz TE-161-Bedenken
 * bewusst bestätigt). Drive-Favoriten kommen als Prop von außen (Dashboard
 * lädt sie ohnehin schon für andere Zwecke), Links holt sich die Komponente
 * weiter selbst per Subscription. Klick auf eine Kachel öffnet die URL bzw.
 * die Drive-Datei extern.
 *
 * Redesign: Pill-Chips (Icon + Text inline, ~34px hoch) statt der alten
 * vertikalen 68px-Karte (großer Icon-Ring oben, Label darunter) – exakt wie
 * im Redesign-Artefakt, damit die Zeile auf derselben Höhe sitzt wie die
 * Fokus-Kacheln (`leading`-Slot, ebenfalls ~34px).
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../utils/theme';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useFamily } from '../hooks/useFamily';
import { LinkItem, subscribeToLinks, openLink } from '../services/links';
import { DriveFile } from '../services/googleDrive';
import { LinkAvatar } from './LinkAvatar';

const DRIVE_COLOR = '#0F9D58';
const DRIVE_MAX = 6;
const SWATCH = 16;

export function LinkCardBar({
  colors,
  showLinks = true,
  driveFavorites = [],
  leading,
  hasLeading = false,
}: {
  colors: ThemeColors;
  /** Steuert nur den Links-Teil (Dashboard-Block-Toggle) – Drive-Favoriten
   *  werden schon vom Aufrufer leer übergeben, wenn deaktiviert. */
  showLinks?: boolean;
  driveFavorites?: DriveFile[];
  /** Fokus-Kacheln (Fußball/Yoga/Garten) – rendern als erste Elemente in
   *  DERSELBEN scrollenden Zeile, nicht als eigene Reihe darüber (Redesign-
   *  Vorgabe: "an den Anfang", innerhalb von Schnellzugriff, nicht davor). */
  leading?: React.ReactNode;
  /** Ob `leading` überhaupt etwas rendert (FussballKachel kann intern null
   *  liefern, das weiß der Aufrufer über settings.funTileThemes vorab). */
  hasLeading?: boolean;
}) {
  const { user } = useFirebaseAuth();
  const { familyId } = useFamily();
  const [links, setLinks] = useState<LinkItem[]>([]);

  const fid = familyId ?? '';
  const uid = user?.uid ?? '';

  useEffect(() => {
    if (!fid || !uid) return;
    return subscribeToLinks(fid, uid, setLinks);
  }, [fid, uid]);

  const active = showLinks ? links.filter((l) => l.active) : [];
  const drive = driveFavorites.slice(0, DRIVE_MAX);
  const driveOverflow = driveFavorites.length - drive.length;

  // Nur sichtbar, wenn es überhaupt etwas zu zeigen gibt.
  if (active.length === 0 && drive.length === 0 && !hasLeading) return null;

  const chipStyle = ({ pressed }: { pressed: boolean }) => [
    s.chip,
    { borderColor: colors.border + '55', backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
  ];

  return (
    <View style={s.section}>
      <View style={s.headerRow}>
        <Ionicons name="link-outline" size={13} color={colors.textMuted} />
        <Text style={[s.headerTitle, { color: colors.textSecondary }]}>SCHNELLZUGRIFF</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {hasLeading && (
          <>
            {leading}
            {(active.length > 0 || drive.length > 0) && <View style={[s.divider, { backgroundColor: colors.border + '55' }]} />}
          </>
        )}
        {active.map((l) => (
          <Pressable key={l.id} style={chipStyle} onPress={() => openLink(l.url)}>
            <LinkAvatar link={l} size={SWATCH} />
            <Text style={[s.chipLabel, { color: colors.textSecondary }]} numberOfLines={1}>{l.title}</Text>
          </Pressable>
        ))}
        {drive.map((f) => {
          const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
          return (
            <Pressable key={f.id} style={chipStyle} onPress={() => f.webViewLink && Linking.openURL(f.webViewLink)}>
              {f.iconLink ? (
                <Image source={{ uri: f.iconLink }} style={s.swatchImg} resizeMode="contain" />
              ) : (
                <Ionicons name={isFolder ? 'folder' : 'document-text-outline'} size={SWATCH} color={DRIVE_COLOR} />
              )}
              <Text style={[s.chipLabel, { color: colors.textSecondary }]} numberOfLines={1}>{f.name}</Text>
            </Pressable>
          );
        })}
        {driveOverflow > 0 && (
          <View style={[s.chip, { borderColor: colors.border + '55', backgroundColor: colors.surface }]}>
            <Text style={[s.chipLabel, { color: colors.textMuted }]}>+{driveOverflow}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 16, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2, paddingRight: 8 },
  divider: { width: 1, alignSelf: 'stretch', marginVertical: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8,
  },
  swatchImg: { width: SWATCH, height: SWATCH, borderRadius: 5 },
  chipLabel: { fontSize: 12.5, fontWeight: '600' },
});
