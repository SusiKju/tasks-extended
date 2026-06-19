/**
 * useScratchpad.ts (TE-104)
 *
 * Kapselt die Anbindung des persönlichen Notizblocks (Scratchpad) an Firestore:
 * Echtzeit-Abo + debounced Save. Früher inline im DashboardScreen – jetzt als
 * Hook, damit Dashboard (nur Anzeige) und Tasks-Tab (Bearbeitung) dieselbe
 * Logik teilen und beide auf denselben Store-Wert schauen.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useFamily } from './useFamily';
import { useFirebaseAuth } from './useFirebaseAuth';
import { subscribeToScratchpad, saveScratchpad } from '../services/scratchpadService';

export function useScratchpad() {
  const scratchpad = useStore((s) => s.scratchpad);
  const setScratchpad = useStore((s) => s.setScratchpad);
  const { familyId } = useFamily();
  const fid = familyId ?? '';
  const { user } = useFirebaseAuth();

  // Firestore-Echtzeit-Abo für den persönlichen Scratchpad.
  useEffect(() => {
    if (!fid || !user?.uid) return;
    const unsub = subscribeToScratchpad(fid, user.uid, (raw) => setScratchpad(raw));
    return unsub;
  }, [fid, user?.uid]);

  // Debounced Firestore-Save 1,5 s nach letzter Eingabe.
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fidRef = useRef(fid);
  fidRef.current = fid;
  const uidRef = useRef(user?.uid);
  uidRef.current = user?.uid;

  const onChange = useCallback((text: string) => {
    setScratchpad(text);
    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    uploadTimer.current = setTimeout(() => {
      const currentFid = fidRef.current;
      const uid = uidRef.current;
      if (!currentFid || !uid) return;
      const { scratchpad: latest } = useStore.getState();
      saveScratchpad(currentFid, uid, latest).catch(() => {});
    }, 1500);
  }, [setScratchpad]);

  return { scratchpad, onChange };
}
