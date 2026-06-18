/**
 * feedHighlightService.ts
 *
 * Long-Press-Highlight im "Mein Tag"-Feed-Block (siehe FeedBlock.tsx, TE-95),
 * persistiert pro User in Firestore und live synchronisiert – analog zum
 * feedOrderService.ts-Pattern.
 *
 * Pfad: families/{familyId}/feedHighlightByUser/{uid}
 * Inhalt: { keys: string[] } – FeedItem.keys der aktuell hervorgehobenen
 * Items, in Auswahl-Reihenfolge (ältestes zuerst). Mehrfach-Auswahl möglich.
 */

import { db } from './firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

/**
 * Abonniert die hervorgehobenen Feed-Items des Users in Echtzeit.
 * Gibt eine Unsubscribe-Funktion zurück.
 */
export function subscribeToFeedHighlight(
  familyId: string,
  uid: string,
  callback: (keys: string[]) => void,
): () => void {
  const ref = doc(db, 'families', familyId, 'feedHighlightByUser', uid);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data()?.keys;
      callback(Array.isArray(data) ? data : []);
    },
    (err) => {
      console.error('[feedHighlightService] subscribeToFeedHighlight fehlgeschlagen:', err);
    },
  );
}

/**
 * Speichert die hervorgehobenen Feed-Items des Users in Firestore.
 */
export async function saveFeedHighlight(
  familyId: string,
  uid: string,
  keys: string[],
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'feedHighlightByUser', uid);
  try {
    await setDoc(ref, { keys, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error('[feedHighlightService] saveFeedHighlight fehlgeschlagen:', err);
  }
}
