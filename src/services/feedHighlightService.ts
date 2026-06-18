/**
 * feedHighlightService.ts
 *
 * Long-Press-Highlight im "Mein Tag"-Feed-Block (siehe FeedBlock.tsx, TE-95),
 * persistiert pro User in Firestore und live synchronisiert – analog zum
 * feedOrderService.ts-Pattern.
 *
 * Pfad: families/{familyId}/feedHighlightByUser/{uid}
 * Inhalt: { key: string | null } – FeedItem.key des aktuell hervorgehobenen
 * Items, oder null wenn keines hervorgehoben ist.
 */

import { db } from './firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

/**
 * Abonniert das hervorgehobene Feed-Item des Users in Echtzeit.
 * Gibt eine Unsubscribe-Funktion zurück.
 */
export function subscribeToFeedHighlight(
  familyId: string,
  uid: string,
  callback: (key: string | null) => void,
): () => void {
  const ref = doc(db, 'families', familyId, 'feedHighlightByUser', uid);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data()?.key;
      callback(typeof data === 'string' ? data : null);
    },
    (err) => {
      console.error('[feedHighlightService] subscribeToFeedHighlight fehlgeschlagen:', err);
    },
  );
}

/**
 * Speichert das hervorgehobene Feed-Item des Users in Firestore.
 */
export async function saveFeedHighlight(
  familyId: string,
  uid: string,
  key: string | null,
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'feedHighlightByUser', uid);
  try {
    await setDoc(ref, { key, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error('[feedHighlightService] saveFeedHighlight fehlgeschlagen:', err);
  }
}
