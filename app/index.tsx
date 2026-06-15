import { useEffect, useState, useCallback } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator, Platform } from 'react-native';
import KindScreen from '../src/screens/KindScreen';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [isChildMode, setIsChildMode] = useState(false);

  const check = useCallback(() => {
    AsyncStorage.getItem('kinder_child_id').then((id) => {
      setIsChildMode(!!id);
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

  if (isChildMode) {
    // onExitChildMode wird aufgerufen wenn PIN korrekt eingegeben → zurück zu Eltern
    return <KindScreen onExitChildMode={check} />;
  }

  return <Redirect href="/(tabs)/dashboard" />;
}
