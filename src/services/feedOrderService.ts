/**
 * feedOrderService.ts
 *
 * Manuelle Sortierung des "Mein Tag"-Feed-Blocks (siehe FeedBlock.tsx),
 * persistiert pro User in Firestore und live synchronisiert – analog zum
 * Scratchpad-Pattern in scratchpadService.ts.
 *
 * Pfad: families/{familyId}/feedOrderByUser/{uid}
 * Inhalt: { order: string[] } – flache Liste von FeedItem.key in der
 * gewünschten Reihenfolge über die ganze (nicht mehr zeitlich gruppierte) Liste.
 *
 * Items, die nicht in der gespeicherten Order vorkommen (neu, oder noch nie
 * verschoben), werden von FeedBlock automatisch hinten angehängt (siehe
 * applyManualOrder in FeedBlock.tsx).
 */

import { db } from './firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

export type FeedOrder = string[];

/**
 * Abonniert die manuelle Feed-Sortierung des Users in Echtzeit.
 * Gibt eine Unsubscribe-Funktion zurück.
 */
export function subscribeToFeedOrder(
  familyId: string,
  uid: string,
  callback: (order: FeedOrder) => void,
): () => void {
  const ref = doc(db, 'families', familyId, 'feedOrderByUser', uid);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data()?.order;
      // Defensive: falls noch ein alter Dokument-Stand (z.B. per-Gruppe-Objekt
      // statt flacher Liste) vorliegt, nicht crashen, sondern auf Default zurückfallen.
      callback(Array.isArray(data) ? data : []);
    },
    (err) => {
      console.error('[feedOrderService] subscribeToFeedOrder fehlgeschlagen:', err);
    },
  );
}

/**
 * Speichert die manuelle Feed-Sortierung des Users in Firestore.
 */
export async function saveFeedOrder(
  familyId: string,
  uid: string,
  order: FeedOrder,
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'feedOrderByUser', uid);
  try {
    await setDoc(ref, { order, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error('[feedOrderService] saveFeedOrder fehlgeschlagen:', err);
  }
}
