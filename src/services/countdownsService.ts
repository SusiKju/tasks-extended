/**
 * countdownsService.ts (TE-171)
 *
 * Private Countdown-Karten pro User in Firestore.
 * Pfad: families/{familyId}/countdownsByUser/{uid}/items/{itemId}
 *
 * Vorher als geteilte Liste unter shared/countdowns/items (sharedCountdowns.ts,
 * TE-130) – auf Wunsch des Users auf privat pro User umgestellt (TE-171),
 * analog zu quickNotesService / personalNotesService.
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export interface Countdown {
  id: string;
  title: string;
  /** Zieldatum als ISO-Datum (YYYY-MM-DD), ohne Uhrzeit. */
  targetDate: string;
  /** Optionaler Sticker, z. B. ✈️ für Urlaub, 🎂 für Geburtstag. */
  emoji?: string | null;
  createdAt: string;
}

const itemsCollection = (familyId: string, uid: string) =>
  collection(db, 'families', familyId, 'countdownsByUser', uid, 'items');

/**
 * Echtzeit-Listener für die eigenen Countdowns – chronologisch nach Zieldatum.
 *
 * `onError` wird bei fehlenden Firestore-Regeln aufgerufen ("permission-denied").
 * Ohne diesen Handler bliebe der Aufrufer für immer im Lade-Zustand hängen
 * (gleiche Lehre wie beim Endlos-Spinner-Fix der geteilten Liste, TE-121).
 */
export function subscribeToCountdowns(
  familyId: string,
  uid: string,
  onChange: (items: Countdown[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    itemsCollection(familyId, uid),
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Countdown))
        .sort((a, b) => a.targetDate.localeCompare(b.targetDate));
      onChange(items);
    },
    (error) => {
      console.warn('subscribeToCountdowns fehlgeschlagen', error);
      onError?.(error);
    }
  );
}

export async function addCountdown(
  familyId: string,
  uid: string,
  title: string,
  targetDate: string,
  emoji: string | null
): Promise<string> {
  const ref = doc(itemsCollection(familyId, uid));
  const item: Omit<Countdown, 'id'> = {
    title: title.trim(),
    targetDate,
    emoji: emoji ?? null,
    createdAt: new Date().toISOString(),
  };
  await setDoc(ref, item);
  return ref.id;
}

export async function updateCountdown(
  familyId: string,
  uid: string,
  itemId: string,
  updates: { title?: string; targetDate?: string; emoji?: string | null }
): Promise<void> {
  await updateDoc(doc(db, 'families', familyId, 'countdownsByUser', uid, 'items', itemId), updates);
}

export async function deleteCountdown(familyId: string, uid: string, itemId: string): Promise<void> {
  await deleteDoc(doc(db, 'families', familyId, 'countdownsByUser', uid, 'items', itemId));
}
