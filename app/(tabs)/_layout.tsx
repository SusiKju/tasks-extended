import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, neonGlow } from '../../src/utils/theme';
import { useStore } from '../../src/store';
import { DEFAULT_VISIBLE_TABS, TabKey } from '../../src/types';

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const visibleTabs = useStore((s) => s.settings.visibleTabs ?? DEFAULT_VISIBLE_TABS);
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
