import React, { useState, useEffect } from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, neonGlow } from '../../src/utils/theme';
import { useStore } from '../../src/store';
import { DEFAULT_VISIBLE_TABS, TabKey } from '../../src/types';
import { useFuerUns } from '../../src/hooks/useFuerUns';

export default function TabsLayout() {
  // TE-57: eigenständige Kinder-Modus-Sperre zusätzlich zum Root-Guard
  // (app/_layout.tsx). Der Root-Guard bounct per useEffect zurück – bei einem
  // direkten Deep-Link auf eine Tab-Route (z. B. /fuer-uns, Hard-Reload im
  // Web) rendert die Ziel-Route dadurch für einen Frame, BEVOR der Bounce
  // greift. Hier wird <TabsLayoutInner> (und damit jeder Tab-Inhalt,
  // insbesondere die privaten "Für uns"-Nachrichten) erst gemountet, nachdem
  // lokal feststeht, dass es kein Kinder-Gerät ist.
  //
  // Wichtig: Dieser Guard muss in einer eigenen Komponente OHNE Daten-Hooks
  // sitzen. useFuerUns() (Firestore-onSnapshot auf die kompletten "Für
  // uns"-Nachrichten) stand früher direkt hier – React führt Hooks aber immer
  // vor einem Return-Statement aus, ein späteres `if (isChildDevice) return
  // <Redirect />` verhindert nur das Rendern von <Tabs>, nicht das Laden der
  // Daten. Auf einem Kind-Gerät wurden dadurch kurzzeitig die echten
  // Nachrichten in den Component-State geladen, bevor der Redirect griff.
  const [isChildDevice, setIsChildDevice] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem('kinder_child_id').then((id) => setIsChildDevice(!!id));
  }, []);

  if (isChildDevice === null) return null;
  if (isChildDevice) return <Redirect href="/" />;

  return <TabsLayoutInner />;
}

function TabsLayoutInner() {
  const { colors, isDark } = useTheme();
  const visibleTabs = useStore((s) => s.settings.visibleTabs ?? DEFAULT_VISIBLE_TABS);
  const { unreadCount } = useFuerUns();
  // TE-49: Elternteil kann Tabs zwischen Dashboard und Settings einzeln ausblenden.
  const hrefFor = (key: TabKey) => (visibleTabs[key] === false ? null : undefined);

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        tabBarActiveTintColor: colors.accentNeon,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: isDark ? 0 : 1,
          ...(isDark ? {
            shadowColor: colors.accentNeon,
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.5,
            shadowRadius: 18,
            elevation: 16,
          } : {}),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: { backgroundColor: colors.header },
        headerTitleStyle: { fontWeight: '700', fontSize: 18, color: colors.text },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          href: hrefFor('tasks'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle-outline" size={size} color={color} />
          ),
        }}
      />
      {/* TE-23: kein eigener "Notizen"-Tab mehr — Inhalt erscheint jetzt
          unterhalb der Task-Liste im Tasks-Tab. */}
      <Tabs.Screen
        name="links"
        options={{
          title: 'Links',
          href: hrefFor('links'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="link-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="mail"
        options={{
          title: 'Mail',
          href: hrefFor('mail'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="mail-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="kids"
        options={{
          title: 'Kinder',
          href: hrefFor('kids'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schule"
        options={{
          title: 'Schule',
          href: hrefFor('schule'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="school-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bambini"
        options={{
          title: 'Bambini',
          href: hrefFor('bambini'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="football-outline" size={size} color={color} />
          ),
          // Trainer-seit-Info neben dem Titel.
          headerRight: () => (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginRight: 16 }}>
              Trainer seit 28.08.2024
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="fuer-uns"
        options={{
          title: 'Für uns',
          href: hrefFor('fuerUns'),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Einstellungen',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
