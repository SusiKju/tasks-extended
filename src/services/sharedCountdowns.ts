/**
 * sharedCountdowns.ts (TE-130)
 *
 * Geteilte Countdown-Karten fürs Dashboard – synchronisiert über Firestore,
 * damit beide Elternteile dieselben Countdowns sehen (z. B. "Gemeinsamer
 * Urlaub"). Folgt demselben Muster wie die geteilte Notizliste in
 * sharedNotes.ts (gleiche Firestore-Regel `shared/{document=**}` deckt auch
 * diesen Pfad ab – keine neue Regel in der Firebase-Konsole nötig).
 *
 * Firestore-Struktur:
 *   shared/countdowns/items/{itemId} → SharedCountdown
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

export interface SharedCountdown {
  id: string;
  title: string;
  /** Zieldatum als ISO-Datum (YYYY-MM-DD), ohne Uhrzeit. */
  targetDate: string;
  /** Optionaler Sticker, z. B. ✈️ für Urlaub, 🎂 für Geburtstag. */
  emoji?: string | null;
  /** Anzeigename der Person, die den Countdown angelegt hat. */
  addedBy: string;
  createdAt: string;
}

const itemsCollection = () => collection(db, 'shared', 'countdowns', 'items');

/**
 * Echtzeit-Listener für die geteilten Countdowns – chronologisch nach Zieldatum.
 *
 * `onError` wird bei fehlenden Firestore-Regeln aufgerufen ("permission-denied").
 * Ohne diesen Handler bliebe der Aufrufer für immer im Lade-Zustand hängen
 * (gleiche Lehre wie beim Endlos-Spinner-Fix der geteilten Liste, TE-121).
 */
export function subscribeToSharedCountdowns(
  onChange: (items: SharedCountdown[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    itemsCollection(),
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as SharedCountdown))
        .sort((a, b) => a.targetDate.localeCompare(b.targetDate));
      onChange(items);
    },
    (error) => {
      console.warn('subscribeToSharedCountdowns fehlgeschlagen', error);
      onError?.(error);
    }
  );
}

export async function addSharedCountdown(
  title: string,
  targetDate: string,
  emoji: string | null,
  addedBy: string
): Promise<string> {
  const ref = doc(itemsCollection());
  const item: Omit<SharedCountdown, 'id'> = {
    title: title.trim(),
    targetDate,
    emoji: emoji ?? null,
    addedBy: addedBy.trim() || 'Jemand',
    createdAt: new Date().toISOString(),
  };
  await setDoc(ref, item);
  return ref.id;
}

export async function updateSharedCountdown(
  itemId: string,
  updates: { title?: string; targetDate?: string; emoji?: string | null }
): Promise<void> {
  await updateDoc(doc(db, 'shared', 'countdowns', 'items', itemId), updates);
}

export async function deleteSharedCountdown(itemId: string): Promise<void> {
  await deleteDoc(doc(db, 'shared', 'countdowns', 'items', itemId));
}
