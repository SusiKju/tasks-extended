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

## Historie

- **2.0.0** (2026-08-26): Einmalige Nachkalibrierung. Die App stand seit Projektbeginn
  (Mai 2026, ~470 Commits, ~240 Feature-Commits) unversioniert auf `1.0.0` — es gab
  nie einen echten Bump. `2.0.0` markiert den Umfang, der bereits existiert, bevor die
  Regel oben griff. Kein Breaking Change im SemVer-Sinn, sondern reine Standortbestimmung.
  Ab hier gilt die PATCH/MINOR/MAJOR-Regel strikt pro Commit.

# Automatische Prüfungen & Auto-Merge

Jeder PR gegen `main` läuft durch `.github/workflows/ci.yml`:

- TypeScript (`npm run typecheck`), ESLint ohne Fehler (`npm run lint`),
  Unit-Tests (`npm test`, Vitest, `src/**/*.test.ts`), Syntax-Check für
  `functions/` und `scripts/`, Versions-Check (package.json = app.json und
  gegenüber `main` hochgesetzt), Web-Build (`expo export -p web`).
- Lokal alles auf einmal: `npm run check`.
- Sind alle Jobs grün, wird der PR automatisch squash-gemergt, der Branch
  gelöscht und `deploy.yml` gestartet. Ausnahmen: Draft-PRs, Fork-PRs und PRs
  mit Label `kein-automerge`.
