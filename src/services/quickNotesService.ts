/**
 * quickNotesService.ts
 *
 * TE-148: Schnelle Notizen pro User in Firestore.
 * Pfad: families/{familyId}/quickNotesByUser/{uid}/notes/{noteId}
 *
 * Bewusst minimal gehalten (nur Text, kein Datum) – eigener, einfacher Abschnitt
 * oberhalb der komplexen Notizen im Notizen-Tab. Privat pro User, analog zu
 * personalNotesService / geistesKacheln.
 */

import { db } from './firebase';
import {
  collection, doc,
  addDoc, setDoc, deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { QuickNote } from '../types';

/** Abonniert alle schnellen Notizen des Users in Echtzeit (neueste zuerst). */
export function subscribeToQuickNotes(
  familyId: string,
  uid: string,
  callback: (notes: QuickNote[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  const col = collection(db, 'families', familyId, 'quickNotesByUser', uid, 'notes');
  return onSnapshot(
    col,
    (snap) => {
      const notes: QuickNote[] = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as QuickNote))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(notes);
    },
    (err) => {
      console.error('[quickNotesService] onSnapshot error:', err.code, err.message);
      onError?.(err);
      callback([]);
    },
  );
}

/** Erstellt eine neue schnelle Notiz und gibt die generierte Firestore-ID zurück. */
export async function addQuickNote(
  familyId: string,
  uid: string,
  text: string,
  important?: boolean,
): Promise<string> {
  const col = collection(db, 'families', familyId, 'quickNotesByUser', uid, 'notes');
  const ref = await addDoc(col, {
    text,
    createdAt: new Date().toISOString(),
    ...(important ? { important: true } : {}),
  });
  return ref.id;
}

/** Aktualisiert Text und/oder Wichtig-Label einer schnellen Notiz. */
export async function updateQuickNote(
  familyId: string,
  uid: string,
  noteId: string,
  updates: Partial<Pick<QuickNote, 'text' | 'important'>>,
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'quickNotesByUser', uid, 'notes', noteId);
  await setDoc(ref, updates, { merge: true });
}

/** Löscht eine schnelle Notiz. */
export async function deleteQuickNote(
  familyId: string,
  uid: string,
  noteId: string,
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'quickNotesByUser', uid, 'notes', noteId);
  await deleteDoc(ref);
}
