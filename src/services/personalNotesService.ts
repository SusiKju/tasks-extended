/**
 * personalNotesService.ts
 *
 * Persönliche Notizen pro User in Firestore.
 * Pfad: families/{familyId}/personalNotesByUser/{uid}/notes/{noteId}
 *
 * Ersetzt die bisherige Google-Drive-Synchronisation aus useGoogleDriveNotesSync.
 *
 * TE-3: Nur noch Altbestand – die Notizen werden beim Öffnen des Tasks-Tabs
 * einmalig zu Ideen migriert (IdeasSection) und hier gelöscht.
 */

import { db } from './firebase';
import {
  collection, doc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { Note } from '../types';

/** Abonniert alle Notizen des Users in Echtzeit. */
export function subscribeToPersonalNotes(
  familyId: string,
  uid: string,
  callback: (notes: Note[]) => void,
): () => void {
  const col = collection(db, 'families', familyId, 'personalNotesByUser', uid, 'notes');
  return onSnapshot(
    col,
    (snap) => {
      const notes: Note[] = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Note))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(notes);
    },
    (err) => {
      console.error('[personalNotesService] onSnapshot error:', err.code, err.message);
      callback([]);
    },
  );
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
