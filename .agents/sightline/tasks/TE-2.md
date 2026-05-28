---
title: Gruppen-Verwaltung für Tasks implementieren
task: TE-2
created: 2026-05-28T08:51
---

## Umgesetzt in

- `src/store/index.ts` — `groups` State, `addGroup`, `updateGroup`, `deleteGroup`
- `src/screens/GroupsScreen.tsx` — vollständige CRUD-UI mit Modal
- `src/components/GroupBadge.tsx` — wiederverwendbares Badge
- `src/screens/TaskListScreen.tsx` — Filter nach Gruppe via Chips
- `src/screens/CreateTaskScreen.tsx` — Gruppenauswahl beim Anlegen
- `src/screens/TaskDetailScreen.tsx` — Gruppenänderung im Edit-Modus

## Features

- Gruppen anlegen, umbenennen, Farbe wählen (10 Preset-Farben), löschen
- Schlüsselwörter pro Gruppe (für TE-6 Auto-Detect)
- Beim Löschen werden betroffene Tasks auf `groupId: null` gesetzt
- 3 Default-Gruppen: Arbeit, Persönlich, Haushalt
- Task-Anzahl pro Gruppe in der Listenansicht sichtbar
