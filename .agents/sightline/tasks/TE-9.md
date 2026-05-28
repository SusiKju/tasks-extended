---
title: Web-App startet nicht – Bundle 500 Error
task: TE-9
created: 2026-05-28T09:26
---

## Problem

`npx expo start --web` startete, aber der Browser bekam HTTP 500 beim Laden des Entry-Bundles. Zwei Ursachen:

1. **`react-native-web` und `react-dom` fehlten** in `package.json` — Expo Web braucht beide zwingend.
2. **`@react-navigation/*` installiert** — Expo Router SDK 56 ist damit inkompatibel. Metro wirft einen InternalError und weigert sich, den Bundle zu bauen.

## Fix

### package.json
- `react-dom: 19.2.6` und `react-native-web: ~0.21.2` als Dependencies ergänzt
- `@react-navigation/bottom-tabs`, `@react-navigation/native`, `@react-navigation/native-stack` entfernt

### src/screens — Migration von react-navigation auf expo-router
| Datei | Vorher | Nachher |
|---|---|---|
| TaskListScreen.tsx | `useNavigation` → `navigate(...)` | `useRouter` → `router.push(...)` |
| TaskDetailScreen.tsx | `useNavigation` + `useRoute` → `route.params.id` | `useRouter` + `useLocalSearchParams` |
| CreateTaskScreen.tsx | `useNavigation` → `navigation.goBack()` | `useRouter` → `router.back()` |

## Ergebnis

Bundle-Endpunkt antwortet mit HTTP 200.
