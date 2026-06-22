/**
 * useImportantTasksSync.ts
 *
 * Hält das „Wichtig"-Label der Tasks mit Firestore synchron (TE-123):
 * - hydratisiert die Labels beim App-Start aus
 *   families/{fid}/importantTasksByUser/{uid}
 * - schreibt lokale Label-Änderungen zurück
 *
 * Notwendig, weil Google Tasks kein „important"-Feld kennt und das Label
 * beim normalen Task-Sync sonst verloren ginge. Zentral in app/_layout.tsx
 * eingehängt, damit der Sync unabhängig vom aktiven Screen läuft – analog
 * zu useMailPinsSync (TE-50).
 */

import { useEffect, useRef } from 'react';
import { Task } from '../types';
import { useStore } from '../store';
import { useFamily } from './useFamily';
import { useFirebaseAuth } from './useFirebaseAuth';
import { subscribeToImportantTasks, saveImportantTasks } from '../services/importantTasksService';

/** Sortierte, eindeutige googleEventIds aller als wichtig markierten Tasks. */
function importantGoogleIds(tasks: Task[]): string[] {
  const ids = new Set<string>();
  for (const t of tasks) {
    if (t.important && t.googleEventId) ids.add(t.googleEventId);
  }
  return [...ids].sort();
}

export function useImportantTasksSync(): void {
  const { familyId } = useFamily();
  const { user } = useFirebaseAuth();
  const fid = familyId ?? '';
  const uid = user?.uid ?? '';

  // Verhindert die Remote→Local→Save→Remote-Schleife: solange wir einen
  // Firestore-Snapshot in den Store schreiben, ignoriert der Save-Listener.
  const applyingRemote = useRef(false);
  // Letzter nach Firestore geschriebener/aus Firestore gelesener Stand,
  // damit unbeteiligte Task-Änderungen (Titel, Datum) keinen Write auslösen.
  const lastSyncedKey = useRef<string | null>(null);

  // Firestore → Store (Echtzeit-Hydration)
  useEffect(() => {
    if (!fid || !uid) return;
    const unsub = subscribeToImportantTasks(fid, uid, (ids) => {
      applyingRemote.current = true;
      useStore.getState().applyImportantTaskGoogleIds(ids);
      lastSyncedKey.current = [...ids].sort().join(',');
      applyingRemote.current = false;
    });
    return unsub;
  }, [fid, uid]);

  // Store → Firestore (beim Setzen/Entfernen des Wichtig-Labels)
  useEffect(() => {
    if (!fid || !uid) return;
    const unsub = useStore.subscribe((state, prev) => {
      if (applyingRemote.current) return;
      if (state.tasks === prev.tasks) return;
      const ids = importantGoogleIds(state.tasks);
      const key = ids.join(',');
      if (key === lastSyncedKey.current) return;
      lastSyncedKey.current = key;
      saveImportantTasks(fid, uid, ids).catch(() => {});
    });
    return unsub;
  }, [fid, uid]);
}
