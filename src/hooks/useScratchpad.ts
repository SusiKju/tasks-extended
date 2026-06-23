/**
 * useScratchpad.ts (TE-104)
 *
 * Kapselt die Anbindung des persönlichen Notizblocks (Scratchpad) an Firestore:
 * Echtzeit-Abo + debounced Save. Früher inline im DashboardScreen – jetzt als
 * Hook, damit Dashboard (nur Anzeige) und Tasks-Tab (Bearbeitung) dieselbe
 * Logik teilen und beide auf denselben Store-Wert schauen.
 *
 * TE-112: zusätzlich der Verlauf gelöschter Notizen (History). Liegt im selben
 * Firestore-Doc (Feld `history`); Archivieren/Zurückholen speichern sofort.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { useFamily } from './useFamily';
import { useFirebaseAuth } from './useFirebaseAuth';
import {
  subscribeToScratchpad,
  saveScratchpad,
  subscribeToScratchpadHistory,
  saveScratchpadHistory,
} from '../services/scratchpadService';
import {
  ScratchEntry,
  ScratchHistoryEntry,
  SCRATCH_HISTORY_MAX,
  makeNoteId,
  parseScratchHistory,
  serializeScratchHistory,
} from '../components/Scratchpad';

export function useScratchpad() {
  const scratchpad = useStore((s) => s.scratchpad);
  const setScratchpad = useStore((s) => s.setScratchpad);
  const scratchpadHistory = useStore((s) => s.scratchpadHistory);
  const setScratchpadHistory = useStore((s) => s.setScratchpadHistory);
  const { familyId } = useFamily();
  const fid = familyId ?? '';
  const { user } = useFirebaseAuth();

  // Firestore-Echtzeit-Abo für den persönlichen Scratchpad + Verlauf.
  useEffect(() => {
    if (!fid || !user?.uid) return;
    const unsub = subscribeToScratchpad(fid, user.uid, (raw) => setScratchpad(raw));
    const unsubHist = subscribeToScratchpadHistory(fid, user.uid, (raw) => setScratchpadHistory(raw));
    return () => { unsub(); unsubHist(); };
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

  const history = useMemo(() => parseScratchHistory(scratchpadHistory), [scratchpadHistory]);

  // Verlauf sofort speichern (diskrete Aktion, keine Tipp-Debounce nötig).
  const persistHistory = useCallback((next: ScratchHistoryEntry[]) => {
    const raw = serializeScratchHistory(next);
    setScratchpadHistory(raw);
    const currentFid = fidRef.current;
    const uid = uidRef.current;
    if (!currentFid || !uid) return;
    saveScratchpadHistory(currentFid, uid, raw).catch(() => {});
  }, [setScratchpadHistory]);

  // TE-112: gelöschte Notiz in den Verlauf legen (neueste oben, gedeckelt).
  const archiveNote = useCallback((entry: ScratchEntry) => {
    if (!entry || entry.text.trim() === '') return;
    const current = parseScratchHistory(useStore.getState().scratchpadHistory);
    const archived: ScratchHistoryEntry = {
      id: entry.id ?? makeNoteId(),
      text: entry.text,
      color: entry.color,
      archivedAt: new Date().toISOString(),
      // TE-144: Wichtig-Label & Fälligkeit mitführen, damit "wieder aktivieren"
      // den Eintrag vollständig wiederherstellt.
      important: entry.important,
      dueDate: entry.dueDate ?? null,
    };
    persistHistory([archived, ...current].slice(0, SCRATCH_HISTORY_MAX));
  }, [persistHistory]);

  // Einen Verlaufseintrag entfernen (nach Zurückholen oder endgültig löschen).
  const removeHistory = useCallback((id: string) => {
    const current = parseScratchHistory(useStore.getState().scratchpadHistory);
    persistHistory(current.filter((e) => e.id !== id));
  }, [persistHistory]);

  const clearHistory = useCallback(() => { persistHistory([]); }, [persistHistory]);

  return {
    scratchpad,
    onChange,
    history,
    archiveNote,
    removeHistory,
    clearHistory,
  };
}
