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
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../utils/theme';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useFamily } from '../hooks/useFamily';
import { LinkItem, subscribeToLinks, openLink } from '../services/links';
import { DriveFile } from '../services/googleDrive';
import { LinkAvatar } from './LinkAvatar';
import { Linking } from 'react-native';

const DRIVE_COLOR = '#0F9D58';
const DRIVE_MAX = 6;

export function LinkCardBar({
  colors,
  showLinks = true,
  driveFavorites = [],
}: {
  colors: ThemeColors;
  /** Steuert nur den Links-Teil (Dashboard-Block-Toggle) – Drive-Favoriten
   *  werden schon vom Aufrufer leer übergeben, wenn deaktiviert. */
  showLinks?: boolean;
  driveFavorites?: DriveFile[];
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
  if (active.length === 0 && drive.length === 0) return null;

  return (
    <View style={s.section}>
      <Text style={[s.headerTitle, { color: colors.textSecondary }]}>SCHNELLZUGRIFF</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
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
        {drive.map((f) => {
          const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
          return (
            <Pressable
              key={f.id}
              style={({ pressed }) => [s.card, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => f.webViewLink && Linking.openURL(f.webViewLink)}
            >
              <View style={[s.driveAvatar, { backgroundColor: colors.surfaceHigh }]}>
                {f.iconLink ? (
                  <Image source={{ uri: f.iconLink }} style={{ width: 20, height: 20 }} resizeMode="contain" />
                ) : (
                  <Ionicons name={isFolder ? 'folder' : 'document-text-outline'} size={18} color={DRIVE_COLOR} />
                )}
              </View>
              <Text style={[s.label, { color: colors.textSecondary }]} numberOfLines={1}>{f.name}</Text>
            </Pressable>
          );
        })}
        {driveOverflow > 0 && (
          <View style={s.overflowCard}>
            <Text style={[s.overflowText, { color: colors.textMuted }]}>+{driveOverflow}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 16, gap: 10 },
  headerTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  row: { flexDirection: 'row', gap: 16, paddingVertical: 2, paddingRight: 8 },
  card: { alignItems: 'center', gap: 5, width: 68 },
  driveAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  overflowCard: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  overflowText: { fontSize: 13, fontWeight: '700' },
});
