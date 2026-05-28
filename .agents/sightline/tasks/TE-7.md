---
title: npm install liefert Fehler
task: TE-7
created: 2026-05-28T09:19
---

## Problem

`npm install` schlug mit zwei Fehlerklassen fehl:

1. **Falscher Node-Version**: Aktiv war Node v14.18.1, aber npm v10 und Expo SDK 56 erfordern Node >=18.17.0.
2. **Inkonsistente Dependency-Versionen** in `package.json` (erzeugt durch TE-1):
   - `react-native-safe-area-context@4.10.1` → `expo-router@56` braucht `>=5.4.0`
   - `react@18.2.0` → `react-native@0.85.3` braucht `^19.2.6`
   - `@types/react@~18.2.79` → `react-native@0.85.3` braucht `^19.1.1`

## Fix

- `.nvmrc` mit `20.20.0` angelegt → `nvm use` wählt automatisch die richtige Version
- `package.json` korrigiert:
  - `react-native-safe-area-context`: `4.10.1` → `5.8.0`
  - `react`: `18.2.0` → `19.2.6`
  - `@types/react`: `~18.2.79` → `~19.2.0`
- `node_modules` und `package-lock.json` nach Korruption durch fehlgeschlagene Teil-Installs gelöscht
- Frischer `npm install`: 603 Pakete, kein Fehler

## Für den Entwickler

Im Terminal vor dem ersten `npm install`:
```bash
nvm use   # liest .nvmrc, wählt Node 20.20.0
```
