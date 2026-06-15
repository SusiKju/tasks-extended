/**
 * useMailPinsSync.ts
 *
 * Hält die angepinnten Mail-IDs (Zustand-Store) mit Firestore synchron (TE-50):
 * - hydratisiert den Store beim App-Start aus families/{fid}/mailPinsByUser/{uid}
 * - schreibt lokale Pin-Änderungen zurück
 *
 * Zentral in app/_layout.tsx eingehängt, damit der Sync unabhängig vom
 * aktiven Screen läuft.
 */

import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useFamily } from './useFamily';
import { useFirebaseAuth } from './useFirebaseAuth';
import { subscribeToMailPins, saveMailPins } from '../services/mailPinsService';

export function useMailPinsSync(): void {
  const { familyId } = useFamily();
  const { user } = useFirebaseAuth();
  const fid = familyId ?? '';
  const uid = user?.uid ?? '';

  // Verhindert die Remote→Local→Save→Remote-Schleife: solange wir einen
  // Firestore-Snapshot in den Store schreiben, ignoriert der Save-Listener.
  const applyingRemote = useRef(false);

  // Firestore → Store (Echtzeit-Hydration)
  useEffect(() => {
    if (!fid || !uid) return;
    const unsub = subscribeToMailPins(fid, uid, (ids) => {
      applyingRemote.current = true;
      useStore.getState().setPinnedMailIds(ids);
      applyingRemote.current = false;
    });
    return unsub;
  }, [fid, uid]);

  // Store → Firestore (beim Pinnen/Entpinnen)
  useEffect(() => {
    if (!fid || !uid) return;
    const unsub = useStore.subscribe((state, prev) => {
      if (applyingRemote.current) return;
      if (state.pinnedMailIds === prev.pinnedMailIds) return;
      saveMailPins(fid, uid, state.pinnedMailIds).catch(() => {});
    });
    return unsub;
  }, [fid, uid]);
}
