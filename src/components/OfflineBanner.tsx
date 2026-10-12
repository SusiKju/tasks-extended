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

/**
 * TE-78: Zeigt in den Einstellungen, ob dieses Gerät offline starten kann –
 * damit man es vor dem Funkloch prüft und nicht erst die Browser-Fehlerseite sieht.
 */
export function useOfflineReadiness(): string {
  const [status, setStatus] = useState('wird geprüft …');
  useEffect(() => {
    if (Platform.OS !== 'web') { setStatus('App-Build – nicht relevant'); return; }
    if (!('serviceWorker' in navigator) || typeof caches === 'undefined') {
      setStatus('Nicht möglich – dieser Browser kann keine Offline-Seiten (iPhone: Safari statt Chrome nutzen)');
      return;
    }
    (async () => {
      const keys = (await caches.keys()).filter((k) => k.startsWith('te-'));
      const cache = keys.length ? await caches.open(keys[keys.length - 1]) : null;
      const hasIndex = !!(cache && (await cache.match('/tasks-extended/')));
      const files = cache ? (await cache.keys()).length : 0;
      if (!navigator.serviceWorker.controller) setStatus('Noch nicht bereit – Seite mit Internet einmal neu laden');
      else if (!hasIndex) setStatus('Noch nicht bereit – Cache leer, Seite mit Internet neu laden');
      else setStatus(`Bereit (${files} Dateien gespeichert)`);
    })().catch((e) => setStatus(`Fehler: ${e?.message ?? e}`));
  }, []);
  return status;
}
