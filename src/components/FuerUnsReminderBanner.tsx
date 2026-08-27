/**
 * FuerUnsReminderBanner.tsx (TE-55)
 *
 * Dashboard-Reminder: "Hast du deinem Partner heute schon etwas geschickt?"
 * Bewusst ruhig gehalten (kein Pulsieren wie die Geburtstags-Card) – gleiche
 * Position/Prominenz, aber gleiches unaufgeregte Muster wie GoogleConnectBanner.
 * Bleibt sichtbar bis die Person SELBST heute etwas geschickt hat (useFuerUns).
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemeColors } from '../utils/theme';

export function FuerUnsReminderBanner({ colors }: { colors: ThemeColors }) {
  const router = useRouter();

  return (
    <View style={[styles.banner, { backgroundColor: '#E8607A' + '18', borderColor: '#E8607A' + '55' }]}>
      <Ionicons name="heart-outline" size={20} color="#E8607A" style={{ flexShrink: 0 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>Für uns</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Hast du deinem Partner heute schon etwas mitgeteilt?
        </Text>
      </View>
      <Pressable
        onPress={() => router.push('/(tabs)/fuer-uns' as any)}
        style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={styles.btnText}>Schreiben</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 4,
    marginTop: 2,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 1 },
  subtitle: { fontSize: 11.5, lineHeight: 16 },
  btn: {
    backgroundColor: '#E8607A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
