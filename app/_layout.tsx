import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="task/new"
          options={{
            title: 'Neuer Task',
            presentation: 'modal',
            headerStyle: { backgroundColor: '#F2F2F7' },
            headerTintColor: '#4F86F7',
          }}
        />
        <Stack.Screen
          name="task/[id]"
          options={{
            title: '',
            headerStyle: { backgroundColor: '#F2F2F7' },
            headerTintColor: '#4F86F7',
            headerBackTitle: 'Zurück',
          }}
        />
      </Stack>
    </>
  );
}
