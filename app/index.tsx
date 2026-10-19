import { useEffect, useState, useCallback } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator, Platform } from 'react-native';
import KindScreen from '../src/screens/KindScreen';
import WandScreen from '../src/screens/WandScreen';

const WAND_KEY = 'wand_mode';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [isChildMode, setIsChildMode] = useState(false);
  const [isWandMode, setIsWandMode] = useState(false);

  const check = useCallback(() => {
    AsyncStorage.multiGet(['kinder_child_id', WAND_KEY]).then(([[, id], [, wand]]) => {
      setIsChildMode(!!id);
      setIsWandMode(wand === '1');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    // Auf Web: ?child=X (&family=Y) aus URL lesen und direkt in Kind-Modus
    // wechseln. Child-IDs sind seit der Multi-Tenant-Migration zufällige
    // Firestore-Doc-IDs (family.ts → addChild ref.id), deshalb gibt es KEINE
    // hartcodierte Whitelist mehr – jeder nicht-leere child-Param zählt.
    // Der eigentliche Datenzugriff ist über die angemeldete Session und die
    // Firestore-Rules abgesichert. Die optionale family-ID wird mitpersistiert,
    // damit KindScreen die Familie kennt (sonst feuert der Task-Listener nicht).
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const childParam = params.get('child');
      const familyParam = params.get('family');
      // ?wall=1: Wand-Modus fürs Display. Bleibt gespeichert, damit ein
      // Neustart des Kiosk-Browsers ohne Parameter wieder dort landet.
      if (params.get('wall') === '1') {
        AsyncStorage.setItem(WAND_KEY, '1').then(check);
        return;
      }
      if (childParam) {
        const writes = [AsyncStorage.setItem('kinder_child_id', childParam)];
        if (familyParam) writes.push(AsyncStorage.setItem('kinder_family_id', familyParam));
        Promise.all(writes).then(check);
        return;
      }
    }
    check();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (isWandMode) {
    return (
      <WandScreen onExit={() => {
        // Parameter aus der URL nehmen, sonst landet ein Reload wieder im Wand-Modus.
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
        AsyncStorage.removeItem(WAND_KEY).then(check);
      }} />
    );
  }

  if (isChildMode) {
    // onExitChildMode wird aufgerufen wenn PIN korrekt eingegeben → zurück zu Eltern
    return <KindScreen onExitChildMode={check} />;
  }

  return <Redirect href="/(tabs)/dashboard" />;
}
