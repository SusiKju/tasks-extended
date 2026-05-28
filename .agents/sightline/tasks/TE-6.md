---
title: Beim Anlegen eines Tasks automatisch die passende Gruppe ermitteln
task: TE-6
created: 2026-05-28T08:51
---

## Umgesetzt in

- `src/utils/autoGroup.ts` — `detectGroup()`, `rankGroupSuggestions()`
- `src/screens/CreateTaskScreen.tsx` — Live-Suggestion beim Tippen
- `src/screens/SettingsScreen.tsx` — An/Aus + Schwellen-Konfiguration

## Algorithmus

Keyword-Matching gegen `group.keywords[]` pro Gruppe:

```
score = anzahl_matches / anzahl_keywords_der_gruppe
```

- Score ≥ Schwelle → Gruppe wird vorgeschlagen
- Fallback: Gruppenname selbst erscheint im Titel/Beschreibung
- Mehrere Treffer → höchster Score gewinnt

## UX

- Beim Tippen (ab 3 Zeichen) erscheint ein Vorschlags-Banner unter der Beschreibung
- Banner zeigt Gruppen-Badge + "Tippen zum Übernehmen"
- Sobald Nutzer manuell eine Gruppe wählt, verschwindet der Vorschlag
- In den Einstellungen: Ein/Aus + Schwelle (Niedrig 20% / Mittel 40% / Hoch 60%)

## Erweiterbarkeit

`detectGroup()` kann gegen eine Claude API ausgetauscht werden für semantisches Matching
(statt nur Keyword-Overlap), ohne UI-Änderungen.
