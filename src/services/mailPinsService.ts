/**
 * mailPinsService.ts
 *
 * Angepinnte E-Mails (Gmail-Message-IDs) pro User in Firestore (TE-50).
 * Pfad: families/{familyId}/mailPinsByUser/{uid}
 *
 * Ein Dokument mit { pinnedMailIds: string[] }. Persistiert die Pin-Auswahl
 * aus TE-38 geräteübergreifend.
 */

import { db } from './firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

/**
 * Abonniert die angepinnten Mail-IDs des Users in Echtzeit.
 * Existiert noch kein Dokument, wird der Callback nicht aufgerufen.
 */
export function subscribeToMailPins(
  familyId: string,
  uid: string,
  callback: (ids: string[]) => void,
): () => void {
  const ref = doc(db, 'families', familyId, 'mailPinsByUser', uid);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data();
      if (data && Array.isArray(data.pinnedMailIds)) {
        callback(data.pinnedMailIds as string[]);
      }
    },
    () => {}, // Fehler stillschweigend ignorieren – lokale Pins bleiben gültig
  );
}

/** Schreibt die aktuelle Pin-Liste (merge) nach Firestore. */
export async function saveMailPins(
  familyId: string,
  uid: string,
  pinnedMailIds: string[],
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'mailPinsByUser', uid);
  await setDoc(ref, { pinnedMailIds, updatedAt: new Date().toISOString() }, { merge: true });
}
