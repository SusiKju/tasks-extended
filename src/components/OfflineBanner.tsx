/**
 * TE-75: Infobox oben, solange das Gerät offline ist. Die App bleibt voll
 * bedienbar (Firestore-Cache + Zustand-Store), Änderungen werden beim
 * Reconnect automatisch synchronisiert.
 */
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isOffline } from '../services/firestoreWrites';

export function OfflineBanner() {
  const [offline, setOffline] = useState(isOffline);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const update = () => setOffline(isOffline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]} accessibilityRole="alert">
      <Text style={styles.text}>
        Offline – du siehst den zuletzt geladenen Stand. Änderungen werden synchronisiert, sobald wieder Internet da ist.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#B45309', paddingHorizontal: 16, paddingBottom: 6 },
  text: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
