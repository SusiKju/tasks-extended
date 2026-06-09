/**
 * migrate-notes-to-firestore.mjs
 *
 * Importiert notes-import.json in Firestore unter:
 *   families/{familyId}/personalNotesByUser/{uid}/notes/{noteId}
 *
 * Voraussetzungen:
 *   1. npm install --save-dev firebase-admin   (einmalig im Terminal)
 *   2. Firebase Console → Project settings → Service accounts
 *      → "Generate new private key" → als serviceAccount.json ins Projekt-Root
 *   3. Script ausführen: node scripts/migrate-notes-to-firestore.mjs
 *
 * Die familyId und uid werden automatisch aus Firestore ermittelt
 * (über die E-Mail-Adresse unten).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Konfiguration ────────────────────────────────────────────────────────────

const USER_EMAIL = 'susikju@gmail.com';   // Firebase-Auth-Email des Users
const SERVICE_ACCOUNT_PATH = resolve(__dirname, '../serviceAccount.json');
const NOTES_JSON_PATH = resolve(__dirname, './notes-import.json');

// ── Init ─────────────────────────────────────────────────────────────────────

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
} catch {
  console.error('❌  serviceAccount.json nicht gefunden!');
  console.error('   → Firebase Console → Project settings → Service accounts → Generate new private key');
  console.error(`   → Als ${SERVICE_ACCOUNT_PATH} speichern`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

// ── Farb-Mapping: Google Keep / alte App-Farben → unterstützte Note-Farben ──

const NOTE_COLORS = ['#F0C040', '#52B87A', '#E8607A', '#4A94C8', '#A878E0', '#E87C3E'];

function normalizeColor(c) {
  if (!c) return '#F0C040';
  // Bereits eine unterstützte Farbe?
  if (NOTE_COLORS.includes(c)) return c;
  // Keep-Farben mappen
  const map = {
    '#81C784': '#52B87A',   // grün
    '#4DB6AC': '#4A94C8',   // türkis → stahl
    '#4FC3F7': '#4A94C8',   // hellblau → stahl
    '#FFF176': '#F0C040',   // gelb
    '#FFB74D': '#E87C3E',   // orange
    '#FF6B6B': '#E8607A',   // rot → koralle
    '#A1887F': '#E87C3E',   // braun → kupfer
  };
  return map[c] ?? '#F0C040';
}

// ── Haupt-Migration ──────────────────────────────────────────────────────────

async function main() {
  // 1) UID per E-Mail nachschlagen
  console.log(`🔍  Suche UID für ${USER_EMAIL}…`);
  let uid;
  try {
    const userRecord = await auth.getUserByEmail(USER_EMAIL);
    uid = userRecord.uid;
    console.log(`✅  UID: ${uid}`);
  } catch (e) {
    console.error(`❌  User nicht gefunden: ${e.message}`);
    process.exit(1);
  }

  // 2) familyId aus userFamilies nachschlagen
  console.log('🔍  Suche familyId…');
  const familyDoc = await db.doc(`userFamilies/${uid}`).get();
  if (!familyDoc.exists) {
    console.error('❌  Kein userFamilies-Eintrag gefunden – User muss sich einmal einloggen.');
    process.exit(1);
  }
  const familyId = familyDoc.data()?.familyId;
  if (!familyId) {
    console.error('❌  familyId fehlt im userFamilies-Dokument.');
    process.exit(1);
  }
  console.log(`✅  familyId: ${familyId}`);

  // 3) Notizen lesen
  let notes;
  try {
    notes = JSON.parse(readFileSync(NOTES_JSON_PATH, 'utf8'));
  } catch (e) {
    console.error(`❌  notes-import.json nicht lesbar: ${e.message}`);
    process.exit(1);
  }
  console.log(`📝  ${notes.length} Notizen gefunden`);

  // 4) Leere / wertlose Notizen filtern
  const filtered = notes.filter((n) => {
    const hasTitle = !!n.title?.trim();
    const hasContent = !!n.content?.trim();
    const hasChecklist = (n.checklist ?? []).some((i) => i.text?.trim());
    return hasTitle || hasContent || hasChecklist;
  });
  console.log(`✂️   ${notes.length - filtered.length} leere Notizen übersprungen → ${filtered.length} werden importiert`);

  // 5) Batch-Import (Firestore-Limit: 500 Ops pro Batch)
  const colRef = db.collection(`families/${familyId}/personalNotesByUser/${uid}/notes`);
  const BATCH_SIZE = 400;
  let imported = 0;

  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = filtered.slice(i, i + BATCH_SIZE);

    for (const note of chunk) {
      const { driveFileId, labels, imageUris, ...rest } = note;
      const docRef = colRef.doc(note.id);
      batch.set(docRef, {
        ...rest,
        color: normalizeColor(note.color),
        // driveFileId + labels weglassen (nicht mehr benötigt)
        updatedAt: note.updatedAt ?? new Date().toISOString(),
        createdAt: note.createdAt ?? new Date().toISOString(),
      });
    }

    await batch.commit();
    imported += chunk.length;
    console.log(`   ✔  ${imported}/${filtered.length} importiert`);
  }

  console.log(`\n🎉  Migration abgeschlossen: ${imported} Notizen in Firestore gespeichert`);
  console.log(`   Pfad: families/${familyId}/personalNotesByUser/${uid}/notes/`);
}

main().catch((e) => {
  console.error('❌  Fehler:', e.message);
  process.exit(1);
});
