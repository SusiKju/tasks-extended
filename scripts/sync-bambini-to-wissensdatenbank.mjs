/**
 * sync-bambini-to-wissensdatenbank.mjs
 *
 * Liest die Bambini-Kinderliste aus Firestore (families/{FAMILY_ID}/config/bambini,
 * siehe src/services/bambini.ts) und schreibt sie als Markdown-Tabelle in die
 * Wissensdatenbank (familie/bambini.md), damit sie dort für Statistiken zur
 * Verfügung steht.
 *
 * Lokal: node scripts/sync-bambini-to-wissensdatenbank.mjs (braucht serviceAccount.json
 * im Projekt-Root). Läuft bewusst nicht über GitHub Actions wie sync-fussball-de.mjs –
 * das Zielverzeichnis ist ein lokal gemountetes Google-Drive-Verzeichnis, kein Repo,
 * daher manuell bzw. per lokalem Cron/launchd ausführen.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const __dirname = dirname(fileURLToPath(import.meta.url));

const FAMILY_ID = 'redmann-db923190';
const OUTPUT_PATH =
  '/Users/matthiasredmann/Meine Ablage/Wissensdatenbank/familie/bambini.md';

const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : JSON.parse(readFileSync(resolve(__dirname, '../serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const escapeCell = (value) => String(value ?? '').trim().replace(/\|/g, '\\|');

function renderMarkdown(children) {
  const sorted = [...children].sort(
    (a, b) => (b.birthYear || 0) - (a.birthYear || 0) || String(a.name).localeCompare(String(b.name), 'de'),
  );
  const active = sorted.filter((c) => !c.stopped);
  const stopped = sorted.filter((c) => c.stopped);
  const byYear = {};
  for (const c of active) {
    if (c.birthYear) byYear[c.birthYear] = (byYear[c.birthYear] ?? 0) + 1;
  }
  const yearLines = Object.keys(byYear)
    .sort((a, b) => b - a)
    .map((y) => `- ${y}: ${byYear[y]} Kind(er)`)
    .join('\n') || '- (keine Jahrgangsdaten)';

  const rows = sorted
    .map((c) => {
      const name = [c.name, c.lastName].filter(Boolean).map(escapeCell).join(' ');
      return `| ${name} | ${c.birthYear || '–'} | ${c.registeredSince || '–'} | ${c.stopped ? 'aufgehört' : 'aktiv'} | ${escapeCell(c.parentName) || '–'} | ${c.whatsapp ? 'ja' : 'nein'} | ${escapeCell(c.info) || '–'} |`;
    })
    .join('\n');

  const stand = new Date().toISOString().slice(0, 10);
  return `# Bambini (G-Jugend Serkowitzer FSV)

_Stand: ${stand} — automatisch synchronisiert aus Firestore (App \`tasks-extended\`, Dokument
\`families/${FAMILY_ID}/config/bambini\`) via \`scripts/sync-bambini-to-wissensdatenbank.mjs\`.
**Nicht manuell bearbeiten** – wird beim nächsten Sync überschrieben. Trainingszeiten siehe
\`familie/lenny.md\`, Abschnitt Verein / Freizeit._

Aktualisieren: \`node scripts/sync-bambini-to-wissensdatenbank.mjs\` im Projektordner
\`tasks-extended\` ausführen (braucht \`serviceAccount.json\` im Projekt-Root).

## Statistik

- Aktiv: ${active.length}, aufgehört: ${stopped.length}, gesamt: ${sorted.length}
- Nach Jahrgang (nur aktive):
${yearLines}

## Kinderliste

| Name | Jahrgang | Angemeldet seit | Status | Elternteil | WhatsApp-Gruppe | Info |
|---|---|---|---|---|---|---|
${rows}
`;
}

const snap = await db.doc(`families/${FAMILY_ID}/config/bambini`).get();
const children = Array.isArray(snap.data()?.children) ? snap.data().children : [];
writeFileSync(OUTPUT_PATH, renderMarkdown(children), 'utf8');
console.log(`${children.length} Kinder geschrieben nach ${OUTPUT_PATH}`);
