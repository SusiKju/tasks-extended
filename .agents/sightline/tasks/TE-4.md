---
title: Due-Date-Format für Tasks festlegen
task: TE-4
created: 2026-05-28T08:51
---

## Umgesetzt in

- `src/utils/dateFormat.ts` — `formatDate()`, `isDueToday()`, `isOverdue()`, `DATE_FORMAT_LABELS`
- `src/screens/SettingsScreen.tsx` — Formatauswahl mit 4 Optionen
- `src/store/index.ts` — `settings.dateFormat: DateFormat` persistiert in AsyncStorage
- `src/components/TaskCard.tsx` — Datum im gewählten Format + farbige Markierung
- `src/screens/TaskDetailScreen.tsx` — Datum im gewählten Format

## Formate

| Key | Beispiel |
|---|---|
| `de` | 28.05.2026 |
| `us` | 05/28/2026 |
| `iso` | 2026-05-28 |
| `relative` | Heute / Morgen / vor 3 Tagen |

## Visuelle Signale

- Überfällig → roter Text + roter Kalender-Icon
- Heute fällig → oranges Text + oranges Icon
- Zukünftig → grauer Text
