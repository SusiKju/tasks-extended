/**
 * migrate-to-family.mjs
 *
 * Einmalige Migration: Kopiert bestehende Firestore-Daten der Familie Redmann
 * aus dem alten Flat-Namespace in den neuen Multi-Tenant-Namespace.
 *
 * Voraussetzung: Node ≥ 18, firebase-Paket installiert (liegt bereits im Projekt).
 *
 * Verwendung:
 *   node scripts/migrate-to-family.mjs \
 *     --uid       <Firebase-Auth-UID>      \
 *     --name      "Matthias Redmann"       \
 *     --email     susikju@gmail.com        \
 *     --family-id familie-redmann          # optional, sonst auto-generiert
 *
 * Ausgabe: Am Ende wird die neue familyId gedruckt – sie in AsyncStorage
 *          (`kinder_family_id`) und in `userFamilies/{uid}` eintragen (macht
 *          das Skript selbst, sofern --uid angegeben).
 *
 * ACHTUNG: Das Skript kopiert Daten; es löscht NICHTS aus dem alten Namespace.
 *          Nach erfolgreicher Migration + manuellem Check kann der alte Namespace
 *          per Firebase Console bereinigt werden.
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection, doc, getDoc, getDocs,
  setDoc, writeBatch,
} from 'firebase/firestore';
import { randomUUID } from 'crypto';

// ── Firebase-Konfiguration (identisch mit src/services/firebase.ts) ──────────
const firebaseConfig = {
  apiKey: "AIzaSyCj035wtqQmy602C9iQAGbg_LzxXXjx4kU",
  authDomain: "tasks-extended-34507.firebaseapp.com",
  projectId: "tasks-extended-34507",
  storageBucket: "tasks-extended-34507.firebasestorage.app",
  messagingSenderId: "425277313752",
  appId: "1:425277313752:web:d43d2f3791591896e47dad",
};

// ── Migration-Konfiguration ────────────────────────────────────────────────────
const LEGACY_CHILDREN = [
  { id: 'lenny',  name: 'Lenny',  color: '#4f86f7', emoji: null },
  { id: 'emil',   name: 'Emil',   color: '#f76e4f', emoji: null },
  { id: 'hannes', name: 'Hannes', color: '#22c55e', emoji: null },
  { id: 'liddy',  name: 'Liddy',  color: '#d946ef', emoji: null },
];

// Deutsches Wortpaar als Familiencode für "Familie Redmann"
const FAMILY_CODE = 'blauer-apfel';
const FAMILY_NAME = 'Familie Redmann';

// ── CLI-Argumente parsen ───────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { uid: null, name: 'Unbekannt', email: '', familyId: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--uid')       opts.uid       = args[++i];
    if (args[i] === '--name')      opts.name      = args[++i];
    if (args[i] === '--email')     opts.email     = args[++i];
    if (args[i] === '--family-id') opts.familyId  = args[++i];
  }
  return opts;
}

// ── Hilfsfunktion: Alle Docs einer Collection kopieren ───────────────────────
async function copyCollection(db, srcPath, destPath, batchRef) {
  const snap = await getDocs(collection(db, ...srcPath.split('/')));
  let count = 0;
  for (const d of snap.docs) {
    batchRef.set(doc(db, ...destPath.split('/'), d.id), d.data());
    count++;
    // Firestore-Batches max. 500 Writes – hier simpel sequenziell
    if (count % 400 === 0) {
      await batchRef.commit();
      batchRef = writeBatch(db);
    }
  }
  return { batch: batchRef, count };
}

// ── Hauptfunktion ──────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  const familyId = opts.familyId ?? `redmann-${randomUUID().slice(0, 8)}`;

  console.log('═══════════════════════════════════════════════');
  console.log('  tasks-extended — Familien-Migration');
  console.log('═══════════════════════════════════════════════');
  console.log(`  familyId  : ${familyId}`);
  console.log(`  code      : ${FAMILY_CODE}`);
  if (opts.uid) {
    console.log(`  uid       : ${opts.uid}`);
    console.log(`  name      : ${opts.name}`);
  } else {
    console.log('  HINWEIS   : Kein --uid angegeben. userFamilies + member werden NICHT geschrieben.');
    console.log('              Bitte Skript erneut ausführen oder nach Login manuell verknüpfen.');
  }
  console.log('───────────────────────────────────────────────\n');

  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  // ── 1. Familie meta + code ────────────────────────────────────────────────
  console.log('[1/8] Familie-Meta schreiben …');
  await setDoc(doc(db, 'families', familyId), {
    name: FAMILY_NAME,
    code: FAMILY_CODE,
    createdAt: new Date().toISOString(),
  });
  await setDoc(doc(db, 'familyCodes', FAMILY_CODE), { familyId });
  console.log('      ✓ families/' + familyId + ' + familyCodes/' + FAMILY_CODE);

  // ── 2. userFamilies + member (nur wenn --uid angegeben) ──────────────────
  if (opts.uid) {
    console.log('[2/8] Nutzer-Verknüpfung schreiben …');
    await setDoc(doc(db, 'userFamilies', opts.uid), { familyId });
    await setDoc(doc(db, 'families', familyId, 'members', opts.uid), {
      uid: opts.uid,
      role: 'parent',
      displayName: opts.name,
      email: opts.email,
      joinedAt: new Date().toISOString(),
    });
    console.log('      ✓ userFamilies/' + opts.uid + ' + member geschrieben');
  } else {
    console.log('[2/8] ÜBERSPRUNGEN (kein --uid)');
  }

  // ── 3. ChildrenConfig ─────────────────────────────────────────────────────
  console.log('[3/8] ChildrenConfig schreiben …');
  for (const child of LEGACY_CHILDREN) {
    await setDoc(doc(db, 'families', familyId, 'childrenConfig', child.id), {
      ...child,
      createdAt: new Date().toISOString(),
    });
  }
  console.log('      ✓ 4 Kinder: lenny, emil, hannes, liddy');

  // ── 4. Kinder-Tasks ───────────────────────────────────────────────────────
  console.log('[4/8] Kinder-Tasks kopieren …');
  let totalTasks = 0;
  for (const child of LEGACY_CHILDREN) {
    const snap = await getDocs(collection(db, 'children', child.id, 'tasks'));
    let b = writeBatch(db);
    let cnt = 0;
    for (const d of snap.docs) {
      b.set(doc(db, 'families', familyId, 'children', child.id, 'tasks', d.id), d.data());
      cnt++;
      if (cnt % 400 === 0) { await b.commit(); b = writeBatch(db); }
    }
    if (cnt % 400 !== 0) await b.commit();
    console.log(`      ✓ ${child.id}: ${cnt} Tasks`);
    totalTasks += cnt;
  }
  console.log(`      Gesamt: ${totalTasks} Tasks`);

  // ── 5. Aktivitätslog ──────────────────────────────────────────────────────
  console.log('[5/8] Aktivitätslog kopieren …');
  let totalActivity = 0;
  for (const child of LEGACY_CHILDREN) {
    const snap = await getDocs(collection(db, 'children', child.id, 'activity'));
    let b = writeBatch(db);
    let cnt = 0;
    for (const d of snap.docs) {
      b.set(doc(db, 'families', familyId, 'children', child.id, 'activity', d.id), d.data());
      cnt++;
      if (cnt % 400 === 0) { await b.commit(); b = writeBatch(db); }
    }
    if (cnt % 400 !== 0) await b.commit();
    totalActivity += cnt;
  }
  console.log(`      ✓ ${totalActivity} Einträge`);

  // ── 6. Kind-Docs (pushToken + reward) ────────────────────────────────────
  console.log('[6/8] Kind-Dokumente (pushToken + reward) kopieren …');
  for (const child of LEGACY_CHILDREN) {
    const snap = await getDoc(doc(db, 'children', child.id));
    if (snap.exists()) {
      await setDoc(doc(db, 'families', familyId, 'children', child.id), snap.data());
      console.log(`      ✓ ${child.id}: Dokument kopiert`);
    } else {
      console.log(`      - ${child.id}: kein Dokument vorhanden`);
    }
  }

  // ── 7. Geteilte Inhalte (Notizen + Countdowns) ───────────────────────────
  console.log('[7/8] Geteilte Notizen + Countdowns kopieren …');

  const noteSnap = await getDocs(collection(db, 'shared', 'notepad', 'items'));
  let nb = writeBatch(db);
  let noteCnt = 0;
  for (const d of noteSnap.docs) {
    nb.set(doc(db, 'families', familyId, 'shared', 'notepad', 'items', d.id), d.data());
    noteCnt++;
    if (noteCnt % 400 === 0) { await nb.commit(); nb = writeBatch(db); }
  }
  if (noteCnt > 0) await nb.commit();
  console.log(`      ✓ ${noteCnt} Notizen`);

  const cdSnap = await getDocs(collection(db, 'shared', 'countdowns', 'items'));
  let cb = writeBatch(db);
  let cdCnt = 0;
  for (const d of cdSnap.docs) {
    cb.set(doc(db, 'families', familyId, 'shared', 'countdowns', 'items', d.id), d.data());
    cdCnt++;
    if (cdCnt % 400 === 0) { await cb.commit(); cb = writeBatch(db); }
  }
  if (cdCnt > 0) await cb.commit();
  console.log(`      ✓ ${cdCnt} Countdowns`);

  // ── 8. Config (Erinnerungszeiten) ─────────────────────────────────────────
  console.log('[8/8] Config kopieren …');
  const configSnap = await getDoc(doc(db, 'config', 'reminders'));
  if (configSnap.exists()) {
    await setDoc(doc(db, 'families', familyId, 'config', 'reminders'), configSnap.data());
    console.log('      ✓ config/reminders');
  } else {
    // Standardwerte schreiben
    await setDoc(doc(db, 'families', familyId, 'config', 'reminders'), { times: ['15:00', '17:00'] });
    console.log('      - kein config/reminders gefunden → Standardwerte geschrieben');
  }

  // ── Zusammenfassung ───────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('  Migration abgeschlossen!');
  console.log('═══════════════════════════════════════════════');
  console.log(`  familyId: ${familyId}`);
  console.log(`  code    : ${FAMILY_CODE}`);
  console.log('\n  Nächste Schritte:');
  if (!opts.uid) {
    console.log('  1. Firebase-UID aus der Konsole holen (Authentication → Users)');
    console.log('     und Skript erneut mit --uid <UID> ausführen.');
  }
  console.log('  2. Task 9 abschließen: Firestore Security Rules aktualisieren.');
  console.log('  3. App starten → Login → Familie "blauer-apfel" beitreten.');
  console.log('═══════════════════════════════════════════════\n');

  process.exit(0);
}

main().catch((e) => {
  console.error('FEHLER:', e);
  process.exit(1);
});
