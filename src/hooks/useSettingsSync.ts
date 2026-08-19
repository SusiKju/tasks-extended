/**
 * useSettingsSync.ts
 *
 * Hält die App-Settings (Zustand-Store) mit Firestore synchron (TE-49,
 * family-weit seit TE-42):
 * - hydratisiert den Store beim App-Start aus families/{fid}/config/settings
 * - schreibt lokale Änderungen debounced zurück
 *
 * Ein Dokument pro Familie statt pro User, damit z.B. besteSchuleStudentIds/
 * fussballDeTeamIds für alle Familienmitglieder gelten. Der beste.schule-
 * Token bleibt weiterhin geräte-lokal (LOCAL_ONLY_SETTING_KEYS).
 *
 * Zentral in app/_layout.tsx eingehängt, damit der Sync unabhängig vom
 * aktiven Screen läuft.
 */

import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useFamily } from './useFamily';
import { subscribeToSettings, saveSettings } from '../services/settingsService';
import { AppSettings } from '../types';

const SAVE_DEBOUNCE_MS = 1000;

export function useSettingsSync(): void {
  const { familyId } = useFamily();
  const fid = familyId ?? '';

  // Verhindert die Remote→Local→Save→Remote-Schleife: solange wir einen
  // Firestore-Snapshot in den Store schreiben, ignoriert der Save-Listener.
  const applyingRemote = useRef(false);

  // Firestore → Store (Echtzeit-Hydration)
  useEffect(() => {
    if (!fid) return;
    const unsub = subscribeToSettings(fid, (remote) => {
      // updatedAt ist Firestore-Metadatum, kein AppSettings-Feld.
      const { updatedAt: _drop, ...settings } = remote as Record<string, unknown>;
      if (Object.keys(settings).length === 0) return;
      applyingRemote.current = true;
      useStore.getState().updateSettings(settings as Partial<AppSettings>);
      applyingRemote.current = false;
    });
    return unsub;
  }, [fid]);

  // Store → Firestore (debounced)
  useEffect(() => {
    if (!fid) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useStore.subscribe((state, prev) => {
      if (applyingRemote.current) return;
      if (state.settings === prev.settings) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveSettings(fid, useStore.getState().settings).catch(() => {});
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [fid]);
}
