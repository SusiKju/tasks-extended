import { useEffect, useState, useCallback } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator } from 'react-native';
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

  useEffect(() => { check(); }, []);

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
