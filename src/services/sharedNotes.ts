/**
 * sharedNotes.ts
 * Geteilte Notiz-/Einkaufsliste für die Eltern (TE-121).
 *
 * Anders als der private Scratchpad (lokal + Google-Drive-Backup pro Gerät)
 * liegt diese Liste in Firestore und wird per Echtzeit-Listener auf allen
 * Geräten sofort synchron gehalten – ideal, damit z. B. beide Elternteile
 * gemeinsam an einer Einkaufsliste arbeiten können.
 *
 * Firestore-Struktur:
 *   shared/notepad/items/{itemId} → SharedNoteItem
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

export interface SharedNoteItem {
  id: string;
  text: string;
  done: boolean;
  /** Anzeigename der Person, die den Eintrag erstellt hat (frei wählbar). */
  addedBy: string;
  createdAt: string;
}

const itemsCollection = () => collection(db, 'shared', 'notepad', 'items');

/** Echtzeit-Listener für die geteilte Liste – älteste zuerst, erledigte ans Ende. */
export function subscribeToSharedNotes(
  onChange: (items: SharedNoteItem[]) => void
): Unsubscribe {
  return onSnapshot(itemsCollection(), (snap) => {
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as SharedNoteItem))
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return a.createdAt.localeCompare(b.createdAt);
      });
    onChange(items);
  });
}

export async function addSharedNote(text: string, addedBy: string): Promise<string> {
  const ref = doc(itemsCollection());
  const item: Omit<SharedNoteItem, 'id'> = {
    text: text.trim(),
    done: false,
    addedBy: addedBy.trim() || 'Jemand',
    createdAt: new Date().toISOString(),
  };
  await setDoc(ref, item);
  return ref.id;
}

export async function toggleSharedNote(itemId: string, done: boolean): Promise<void> {
  await updateDoc(doc(db, 'shared', 'notepad', 'items', itemId), { done });
}

export async function deleteSharedNote(itemId: string): Promise<void> {
  await deleteDoc(doc(db, 'shared', 'notepad', 'items', itemId));
}

/** Entfernt alle bereits abgehakten Einträge in einem Rutsch ("Liste aufräumen"). */
export async function clearDoneSharedNotes(items: SharedNoteItem[]): Promise<void> {
  const done = items.filter((i) => i.done);
  await Promise.all(done.map((i) => deleteSharedNote(i.id)));
}
