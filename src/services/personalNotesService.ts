/**
 * personalNotesService.ts
 *
 * Persönliche Notizen pro User in Firestore.
 * Pfad: families/{familyId}/personalNotesByUser/{uid}/notes/{noteId}
 *
 * Ersetzt die bisherige Google-Drive-Synchronisation aus useGoogleDriveNotesSync.
 */

import { db } from './firebase';
import {
  collection, doc,
  addDoc, setDoc, deleteDoc,
  onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { Note } from '../types';

/** Abonniert alle Notizen des Users in Echtzeit. */
export function subscribeToPersonalNotes(
  familyId: string,
  uid: string,
  callback: (notes: Note[]) => void,
): () => void {
  const col = collection(db, 'families', familyId, 'personalNotesByUser', uid, 'notes');
  const q = query(col, orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const notes: Note[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Note));
      callback(notes);
    },
    (err) => {
      console.error('[personalNotesService] onSnapshot error:', err.code, err.message);
      // Temporärer Debug-Alert – wird nach Diagnose wieder entfernt
      if (typeof window !== 'undefined' && (window as any).alert) {
        (window as any).alert(`Notizen-Subscription Fehler:\n${err.code}\n${err.message}`);
      }
      callback([]);
    },
  );
}

/** Erstellt eine neue Notiz und gibt die generierte Firestore-ID zurück. */
export async function addPersonalNote(
  familyId: string,
  uid: string,
  note: Omit<Note, 'id'>,
): Promise<string> {
  const col = collection(db, 'families', familyId, 'personalNotesByUser', uid, 'notes');
  const ref = await addDoc(col, note);
  return ref.id;
}

/** Aktualisiert eine bestehende Notiz. */
export async function updatePersonalNote(
  familyId: string,
  uid: string,
  noteId: string,
  updates: Partial<Note>,
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'personalNotesByUser', uid, 'notes', noteId);
  await setDoc(ref, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
}

/** Löscht eine Notiz. */
export async function deletePersonalNote(
  familyId: string,
  uid: string,
  noteId: string,
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'personalNotesByUser', uid, 'notes', noteId);
  await deleteDoc(ref);
}
