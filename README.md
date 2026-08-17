# tasks-extended

Aufgabenverwaltung mit Google-Sync, gebaut mit Expo (React Native + Web).

- **Live (Web/PWA):** https://susikju.github.io/tasks-extended/
- **Kinder-Ansicht:** https://susikju.github.io/tasks-extended/kinder
- **Repo:** https://github.com/SusiKju/tasks-extended

## Voraussetzungen

- Node `20.20.0` (siehe `.nvmrc`, z. B. via `nvm use`)
- Ein Firebase-Projekt (Firestore) — Projekt-ID siehe `google-services.json` (`project_id`)
- Für Google-Login: eine Google-OAuth-Web-Client-ID (siehe `.env.example`)

## Lokaler Server

```bash
npm install
cp .env.example .env   # EXPO_PUBLIC_GOOGLE_CLIENT_ID eintragen
npm start              # Expo Dev-Server (Metro), wähle iOS/Android/Web im Terminal
```

Alternativ direkt für eine Plattform:

```bash
npm run web       # im Browser
npm run ios       # iOS-Simulator
npm run android   # Android-Emulator
```

## Firestore Rules & Indexes deployen

Rules und Indexes werden **nicht** automatisch von CI deployt — nach jeder Änderung an
`firestore.rules` oder `firestore.indexes.json` manuell deployen:

```bash
npx firebase-tools login              # einmalig
npx firebase-tools use <projekt-id>   # bzw. --project <projekt-id> anhängen
npx firebase-tools deploy --only firestore:rules
npx firebase-tools deploy --only firestore:indexes
```

Fehlt eine Rule für eine neue Collection, bleibt der zugehörige Tab in der App leer
(Permission-Fehler), auch wenn der Code korrekt ist.

## Deployment

Push nach `main` löst automatisch `.github/workflows/deploy.yml` aus: Web-Export via
`expo export -p web`, dann Veröffentlichung auf GitHub Pages
(https://susikju.github.io/tasks-extended/). Der Google-Client-ID-Secret
(`EXPO_PUBLIC_GOOGLE_CLIENT_ID`) ist in den Repo-Secrets hinterlegt.

## Hilfsskripte (`scripts/`)

- `check-membership.mjs` — prüft Familien-/Gruppenmitgliedschaften in Firestore
- `migrate-notes-to-firestore.mjs` — einmalige Migration alter Notizen nach Firestore
- `migrate-to-family.mjs` — einmalige Migration auf das Familien-Datenmodell

Diese Skripte benötigen `serviceAccount.json` (nicht versioniert, siehe `.gitignore`)
und werden mit Node direkt ausgeführt, z. B. `node scripts/check-membership.mjs`.
