/**
 * LinkChip.tsx
 *
 * Kompakter, klickbarer Link: Favicon (direkt von der Zielseite, kein
 * Drittanbieter) + Domain statt der ausgeschriebenen, oft langen URL.
 * Genutzt in Geistesblitzen und Personal Tasks.
 */

import React, { useState } from 'react';
import { View, Text, Pressable, Image, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '../utils/theme';

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function LinkChip({ url, color, colors, onRemove, small }: {
  url: string;
  color: string;
  colors: ThemeColors;
  /** Ohne onRemove kein ×-Button (Nur-Anzeige). */
  onRemove?: () => void;
  small?: boolean;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const host = hostOf(url);
  const pad = small ? 5 : 8;
  return (
    <View style={[s.chip, { borderColor: color + '66', backgroundColor: color + '14' }]}>
      <Pressable
        style={[s.open, { paddingVertical: pad, paddingRight: onRemove ? 0 : 10 }]}
        onPress={() => Linking.openURL(url)}
        accessibilityRole="link"
        accessibilityLabel={`Link öffnen: ${host}`}
      >
        {iconFailed
          ? <Ionicons name="link-outline" size={small ? 13 : 15} color={color} />
          : <Image source={{ uri: `https://${host}/favicon.ico` }} style={small ? s.faviconSmall : s.favicon} onError={() => setIconFailed(true)} />}
        <Text style={[s.text, { color: colors.text, fontSize: small ? 12 : 13 }]} numberOfLines={1}>{host}</Text>
      </Pressable>
      {onRemove && (
        <Pressable style={[s.remove, { paddingVertical: pad }]} onPress={onRemove} accessibilityLabel={`Link ${host} entfernen`}>
          <Ionicons name="close" size={14} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, maxWidth: '100%' },
  open: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 10, flexShrink: 1 },
  remove: { paddingHorizontal: 10 },
  favicon: { width: 16, height: 16, borderRadius: 3 },
  faviconSmall: { width: 13, height: 13, borderRadius: 3 },
  text: { fontWeight: '600', flexShrink: 1 },
});
