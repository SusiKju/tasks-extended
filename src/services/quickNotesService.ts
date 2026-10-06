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

/**
 * Erstellt eine neue schnelle Notiz (TE-3: „Idee") und gibt die ID zurück.
 * `opts.id` setzt die Doc-ID fest – für die idempotente Migration alter Notizen.
 */
export async function addQuickNote(
  familyId: string,
  uid: string,
  text: string,
  opts: { id?: string; createdAt?: string } = {},
): Promise<string> {
  const col = collection(db, 'families', familyId, 'quickNotesByUser', uid, 'notes');
  const data = { text, createdAt: opts.createdAt ?? new Date().toISOString() };
  if (opts.id) {
    await setDoc(doc(col, opts.id), data);
    return opts.id;
  }
  const ref = await addDoc(col, data);
  return ref.id;
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
