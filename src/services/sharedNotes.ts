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
  /** Zeitpunkt des Abhakens – Basis für die "diese Woche erledigt"-Statistik (TE-124). */
  doneAt?: string | null;
  /** Optionaler Sticker/Emoji vor dem Text, z. B. 🛒 für Einkauf, ❤️ für Persönliches (TE-124). */
  emoji?: string | null;
  /** Liebevolle Reaktion der/des anderen auf diesen Eintrag (TE-124). */
  reaction?: { emoji: string; by: string } | null;
}

/** Vorausgewählte Sticker zur Auswahl beim Hinzufügen eines Eintrags (TE-124). */
export const SHARED_NOTE_EMOJIS = ['🛒', '🎁', '❤️', '🏠', '📅', '✨', '🧒🧒🧒🧒'];

/** Vorausgewählte Reaktionen, mit denen man liebevoll auf einen Eintrag antworten kann (TE-124). */
export const SHARED_NOTE_REACTIONS = ['❤️', '😘', '🤗', '👍'];

const itemsCollection = (familyId: string) =>
  collection(db, 'families', familyId, 'shared', 'notepad', 'items');

/**
 * Echtzeit-Listener für die geteilte Liste – älteste zuerst, erledigte ans Ende.
 *
 * `onError` wird z. B. bei fehlenden Firestore-Regeln für den Pfad `shared/...`
 * aufgerufen ("permission-denied"). Ohne diesen Handler bliebe der Aufrufer
 * für immer im Lade-Zustand hängen (Endlos-Spinner), weil `onSnapshot` bei
 * einem Fehler keinen weiteren Snapshot mehr liefert (TE-121-Fix).
 */
export function subscribeToSharedNotes(
  familyId: string,
  onChange: (items: SharedNoteItem[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    itemsCollection(familyId),
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as SharedNoteItem))
        .sort((a, b) => {
          if (a.done !== b.done) return a.done ? 1 : -1;
          return a.createdAt.localeCompare(b.createdAt);
        });
      onChange(items);
    },
    (error) => {
      console.warn('subscribeToSharedNotes fehlgeschlagen', error);
      onError?.(error);
    }
  );
}

export async function addSharedNote(familyId: string, text: string, addedBy: string, emoji?: string | null): Promise<string> {
  const ref = doc(itemsCollection(familyId));
  const item: Omit<SharedNoteItem, 'id'> = {
    text: text.trim(),
    done: false,
    addedBy: addedBy.trim() || 'Jemand',
    createdAt: new Date().toISOString(),
    doneAt: null,
    emoji: emoji ?? null,
    reaction: null,
  };
  await setDoc(ref, item);
  return ref.id;
}

export async function toggleSharedNote(familyId: string, itemId: string, done: boolean): Promise<void> {
  await updateDoc(doc(db, 'families', familyId, 'shared', 'notepad', 'items', itemId), {
    done,
    doneAt: done ? new Date().toISOString() : null,
  });
}

/**
 * Setzt (oder entfernt) eine liebevolle Reaktion auf einen Eintrag – das moderne
 * Pendant zum alten Facebook-"Anstupsen"/"Gefällt mir" (TE-124).
 */
export async function setSharedNoteReaction(
  familyId: string,
  itemId: string,
  reaction: { emoji: string; by: string } | null
): Promise<void> {
  await updateDoc(doc(db, 'families', familyId, 'shared', 'notepad', 'items', itemId), { reaction });
}

export async function deleteSharedNote(familyId: string, itemId: string): Promise<void> {
  await deleteDoc(doc(db, 'families', familyId, 'shared', 'notepad', 'items', itemId));
}

/** Zählt, wie viele Einträge in den letzten 7 Tagen gemeinsam erledigt wurden (TE-124). */
export function countDoneThisWeek(items: SharedNoteItem[]): number {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return items.filter((i) => i.done && i.doneAt && new Date(i.doneAt).getTime() >= weekAgo).length;
}

/** Entfernt alle bereits abgehakten Einträge in einem Rutsch ("Liste aufräumen"). */
export async function clearDoneSharedNotes(familyId: string, items: SharedNoteItem[]): Promise<void> {
  const done = items.filter((i) => i.done);
  await Promise.all(done.map((i) => deleteSharedNote(familyId, i.id)));
}
