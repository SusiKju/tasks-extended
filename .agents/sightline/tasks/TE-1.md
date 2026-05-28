---
title: Cross-Platform Mobile Task-App aufbauen (Android & iOS)
task: TE-1
created: 2026-05-28T08:51
---

## Ziel

Grundstruktur einer React Native Expo App zur Task-Verwaltung. Die App läuft auf Android und iOS, hat eine klare Navigation und eine Basis-UI, auf der alle weiteren Features (TE-2 bis TE-6) aufgebaut werden.

## Stack

- **Framework:** Expo SDK + TypeScript
- **Navigation:** React Navigation (Bottom Tabs + Stack)
- **State:** Zustand + AsyncStorage (Persistenz)
- **Styling:** StyleSheet (inline, kein externes CSS-Framework)

## Screens

| Screen | Route | Beschreibung |
|---|---|---|
| TaskList | / (Tab) | Alle Tasks, gruppiert |
| TaskDetail | /task/:id | Einzelansicht, Edit, Anhänge |
| CreateTask | /task/new | Formular: Titel, Beschreibung, Gruppe, Datum |
| Groups | /groups (Tab) | Gruppen verwalten |
| Settings | /settings (Tab) | Datum-Format, Calendar-Sync |

## Konkrete Schritte

1. package.json mit allen nötigen Dependencies
2. app.json (Expo-Konfiguration)
3. tsconfig.json
4. Typen: Task, Group, Attachment, AppSettings
5. Zustand-Store: tasks, groups, settings
6. App.tsx mit Navigation
7. Alle Screens (Grundgerüst + Basis-Interaktion)
8. Wiederverwendbare Komponenten: TaskCard, GroupBadge
