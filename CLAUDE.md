# Versionierung

Bei **jedem** Feature/Fix, das gemerged wird, muss die Version in **beiden** Dateien
gleichzeitig hochgesetzt werden:

- `package.json` → `"version"`
- `app.json` → `"expo.version"`

Die Version in den Settings (`src/screens/SettingsScreen.tsx`) liest automatisch aus
`Constants.expoConfig?.version` (expo-constants) — dort muss nichts manuell geändert
werden, solange `app.json` stimmt.

## Wann welche Stelle hochsetzen (SemVer `MAJOR.MINOR.PATCH`)

- **PATCH** (`1.1.0` → `1.1.1`): Bugfix, kleine UI-Korrektur, keine neue Funktion.
- **MINOR** (`1.1.0` → `1.2.0`): neues Feature, neue Ansicht, neue Einstellung.
- **MAJOR** (`1.1.0` → `2.0.0`): Breaking Change — z. B. Datenmodell-Migration, die
  alte Daten unbrauchbar macht, oder ein kompletter Rewrite eines Kernbereichs.

Im Zweifel: MINOR. Bei reinen Fixes: PATCH.
