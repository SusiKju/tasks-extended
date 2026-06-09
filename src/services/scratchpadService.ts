/**
 * scratchpadService.ts
 *
 * Persönlicher Notizblock (Scratchpad) pro User in Firestore.
 * Pfad: families/{familyId}/scratchpadByUser/{uid}
 *
 * Ersetzt die bisherige Google-Drive-Synchronisation.
 */

import { db } from './firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

/**
 * Abonniert den Scratchpad-Inhalt des Users in Echtzeit.
 * Gibt eine Unsubscribe-Funktion zurück.
 */
export function subscribeToScratchpad(
  familyId: string,
  uid: string,
  callback: (raw: string) => void,
): () => void {
  const ref = doc(db, 'families', familyId, 'scratchpadByUser', uid);
  return onSnapshot(
    ref,
    (snap) => {
      callback(snap.data()?.raw ?? '');
    },
    () => {}, // Fehler stillschweigend ignorieren
  );
}

/**
 * Speichert den aktuellen Scratchpad-Inhalt in Firestore.
 */
export async function saveScratchpad(
  familyId: string,
  uid: string,
  raw: string,
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'scratchpadByUser', uid);
  await setDoc(ref, { raw, updatedAt: new Date().toISOString() }, { merge: true });
}
