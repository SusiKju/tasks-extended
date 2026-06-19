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
      // TE-115: nur server-bestätigte Stände anwenden. Lokale Änderungen sind
      // bereits optimistisch im Store; würden wir hier auch unbestätigte
      // (pending) Snapshots übernehmen, überschreibt ein gerade abgesetzter
      // history-Write (eigenes Doc, anderes Feld) den noch nicht geflushten,
      // debounced raw-Stand mit dem ALTEN raw – die gelöschte Notiz käme zurück.
      if (snap.metadata.hasPendingWrites) return;
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

/**
 * TE-112: Verlauf gelöschter Notizen. Liegt als zweites Feld `history` im
 * selben Doc wie der Scratchpad – keine neue Collection/Rule nötig. Der Wert
 * ist ein serialisiertes JSON-Array von ScratchHistoryEntry.
 */

/**
 * Abonniert den Notiz-Verlauf des Users in Echtzeit.
 * Gibt eine Unsubscribe-Funktion zurück.
 */
export function subscribeToScratchpadHistory(
  familyId: string,
  uid: string,
  callback: (raw: string) => void,
): () => void {
  const ref = doc(db, 'families', familyId, 'scratchpadByUser', uid);
  return onSnapshot(
    ref,
    (snap) => {
      // TE-115: symmetrisch zum raw-Abo – nur server-bestätigte Stände anwenden,
      // damit ein debounced raw-Write den lokal schon gesetzten Verlauf nicht
      // mit einem veralteten history-Feld überschreibt.
      if (snap.metadata.hasPendingWrites) return;
      callback(snap.data()?.history ?? '');
    },
    () => {}, // Fehler stillschweigend ignorieren
  );
}

/**
 * Speichert den Notiz-Verlauf in Firestore.
 */
export async function saveScratchpadHistory(
  familyId: string,
  uid: string,
  history: string,
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'scratchpadByUser', uid);
  await setDoc(ref, { history, historyUpdatedAt: new Date().toISOString() }, { merge: true });
}
