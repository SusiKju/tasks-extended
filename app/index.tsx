import { useEffect, useState, useCallback } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator, Platform } from 'react-native';
import KindScreen from '../src/screens/KindScreen';

const VALID_CHILDREN = ['lenny', 'emil', 'hannes', 'liddy'];

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
    // Auf Web: ?child=X aus URL lesen und direkt in Kind-Modus wechseln
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const childParam = params.get('child');
      if (childParam && VALID_CHILDREN.includes(childParam)) {
        AsyncStorage.setItem('kinder_child_id', childParam).then(check);
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
