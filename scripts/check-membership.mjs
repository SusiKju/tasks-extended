import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const __dirname = dirname(fileURLToPath(import.meta.url));

const sa = JSON.parse(readFileSync(resolve(__dirname, '../serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const auth = getAuth();

const email = 'susikju@gmail.com';
const familyId = 'redmann-db923190';

const user = await auth.getUserByEmail(email);
const uid = user.uid;
console.log('UID:', uid);

// Check userFamilies link
const ufDoc = await db.doc(`userFamilies/${uid}`).get();
console.log('userFamilies link:', ufDoc.exists ? ufDoc.data() : 'FEHLT');

// Check member document
const memberDoc = await db.doc(`families/${familyId}/members/${uid}`).get();
console.log(`members/${uid}:`, memberDoc.exists ? 'EXISTS ✓' : 'FEHLT ✗');

// Check if there are any members at all
const membersSnap = await db.collection(`families/${familyId}/members`).get();
console.log('Alle Members:', membersSnap.docs.map(d => d.id));
