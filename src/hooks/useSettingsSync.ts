/**
 * useSettingsSync.ts
 *
 * Hält die App-Settings (Zustand-Store) mit Firestore synchron (TE-49):
 * - hydratisiert den Store beim App-Start aus families/{fid}/settingsByUser/{uid}
 * - schreibt lokale Änderungen debounced zurück
 *
 * Zentral in app/_layout.tsx eingehängt, damit der Sync unabhängig vom
 * aktiven Screen läuft.
 */

import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useFamily } from './useFamily';
import { useFirebaseAuth } from './useFirebaseAuth';
import { subscribeToSettings, saveSettings } from '../services/settingsService';
import { AppSettings } from '../types';

const SAVE_DEBOUNCE_MS = 1000;

export function useSettingsSync(): void {
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
    const unsub = subscribeToSettings(fid, uid, (remote) => {
      // updatedAt ist Firestore-Metadatum, kein AppSettings-Feld.
      const { updatedAt: _drop, ...settings } = remote as Record<string, unknown>;
      if (Object.keys(settings).length === 0) return;
      applyingRemote.current = true;
      useStore.getState().updateSettings(settings as Partial<AppSettings>);
      applyingRemote.current = false;
    });
    return unsub;
  }, [fid, uid]);

  // Store → Firestore (debounced)
  useEffect(() => {
    if (!fid || !uid) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useStore.subscribe((state, prev) => {
      if (applyingRemote.current) return;
      if (state.settings === prev.settings) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveSettings(fid, uid, useStore.getState().settings).catch(() => {});
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [fid, uid]);
}
