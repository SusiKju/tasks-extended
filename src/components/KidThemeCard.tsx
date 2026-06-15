/**
 * KidThemeCard.tsx (TE-65 / TE-70)
 *
 * Zeigt in der Kinder-App ein themenspezifisches Item (Fußballspieler, Lego)
 * mit Bild, Name, Zusatzinfos und Kurztext. Lädt beim Mounten – also bei jedem
 * Reload/Öffnen der Kinder-Ansicht – ein neues zufälliges Item; ein
 * Aktualisieren-Button zieht auf Wunsch das nächste.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Image, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeColors } from '../utils/theme';
import { KidTheme } from '../types';
import { fetchKidThemeItem, KidThemeItem } from '../services/kidThemeContent';

/** Überschrift je Thema – kindgerecht. */
const THEME_HEADING: Record<KidTheme, string> = {
  fussball: '⚽ Fußball-Star',
  lego: '🧱 Lego-Entdeckung',
};

interface Props {
  theme: KidTheme;
}

export default function KidThemeCard({ theme }: Props) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [item, setItem] = useState<KidThemeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const next = await fetchKidThemeItem(theme);
      if (next) setItem(next);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [theme]);

  // Bei Theme-Wechsel bzw. Mount (= jedem Reload) neu laden.
  useEffect(() => { load(); }, [load]);

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.heading}>{THEME_HEADING[theme]}</Text>
        <TouchableOpacity
          onPress={load}
          disabled={loading}
          style={s.refreshBtn}
          hitSlop={8}
          accessibilityLabel="Neues Bild laden"
        >
          <Ionicons name="refresh" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.accentNeon} />
        </View>
      ) : failed || !item ? (
        <TouchableOpacity style={s.center} onPress={load} activeOpacity={0.7}>
          <Text style={s.errorText}>Konnte gerade nichts laden 😕</Text>
          <Text style={s.errorHint}>Tippen zum Nochmal-Versuchen</Text>
        </TouchableOpacity>
      ) : (
        <>
          {item.imageUrl && (
            <Image source={{ uri: item.imageUrl }} style={s.image} resizeMode="cover" />
          )}
          <Text style={s.title}>{item.title}</Text>
          {item.facts.length > 0 && (
            <View style={s.facts}>
              {item.facts.map((f) => (
                <View key={f.label} style={s.factPill}>
                  <Text style={s.factText}>{f.label}: {f.value}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={s.extract} numberOfLines={4}>{item.extract}</Text>
        </>
      )}
    </View>
  );
}

const styles = (c: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: c.surfaceHigh,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    gap: 10,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: { fontSize: 16, fontWeight: '700', color: c.text },
  refreshBtn: { padding: 4 },
  center: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 4 },
  image: {
    width: '100%' as any,
    height: 200,
    borderRadius: 12,
    backgroundColor: c.surface,
  },
  title: { fontSize: 18, fontWeight: '700', color: c.text },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  factPill: {
    backgroundColor: c.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  factText: { fontSize: 13, fontWeight: '600', color: c.accentFg },
  extract: { fontSize: 14, color: c.textSecondary, lineHeight: 20 },
  errorText: { fontSize: 15, color: c.text },
  errorHint: { fontSize: 12, color: c.textMuted },
});
