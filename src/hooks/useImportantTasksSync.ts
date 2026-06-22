/**
 * useImportantTasksSync.ts
 *
 * Hält das „Wichtig"-Label der Tasks mit Firestore synchron (TE-123).
 *
 * Google Tasks kennt kein „important"-Feld, deshalb läuft der normale
 * Task-Sync (Richtung Google) ohne das Label. Damit es geräteübergreifend
 * erhalten bleibt, gibt es einen zweiten, davon unabhängigen Sync Richtung
 * Firestore: families/{fid}/importantTasksByUser/{uid}, als Menge der
 * googleEventIds der wichtigen Tasks.
 *
 * Zwei Richtungen:
 *
 *  1. Firestore → Store (Pull): ein onSnapshot-Listener wendet die Remote-Menge
 *     auf die lokalen Tasks an (Remote gewinnt bei Remote-Änderung). Wichtig:
 *     Beim Kaltstart feuert onSnapshot sofort, bevor die Tasks aus Google
 *     importiert sind. Deshalb wird die zuletzt bekannte Remote-Menge gemerkt
 *     und erneut angewendet, sobald neue (noch nicht abgeglichene) Tasks im
 *     Store auftauchen – sonst ginge das Label auf dem empfangenden Gerät
 *     verloren (genau der Bug, der „synct nicht" verursacht hat).
 *
 *  2. Store → Firestore (Push): wird das Label lokal gesetzt/entfernt, wird die
 *     neue Menge nach Firestore geschrieben.
 *
 * Zentral in app/_layout.tsx eingehängt, damit der Sync unabhängig vom
 * aktiven Screen läuft – analog zu useSettingsSync (TE-49) / useMailPinsSync (TE-50).
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
  // Firestore-Stand in den Store schreiben, ignoriert der Push-Listener.
  const applyingRemote = useRef(false);
  // Zuletzt bekannte Remote-Menge (null = noch keinen Firestore-Stand gesehen).
  const remoteIds = useRef<Set<string> | null>(null);
  // Erst nach dem ersten Firestore-Snapshot darf gepusht werden – sonst würde
  // ein kalt startendes Gerät seinen (noch leeren) lokalen Stand hochladen und
  // damit die wichtigen Tasks eines anderen Geräts überschreiben (Clobber).
  const initialized = useRef(false);
  // Tasks (googleEventId), die bereits gegen den Remote-Stand abgeglichen wurden.
  // Neu auftauchende Tasks bekommen den Remote-Stand nachträglich angewendet,
  // bereits abgeglichene Tasks dürfen vom User frei umgeschaltet werden.
  const reconciledIds = useRef<Set<string>>(new Set());
  // Letzter nach Firestore geschriebener/aus Firestore gelesener Stand,
  // damit unbeteiligte Task-Änderungen (Titel, Datum) keinen Write auslösen.
  const lastSyncedKey = useRef<string | null>(null);

  // Beim Wechsel von Familie/User die Caches zurücksetzen.
  useEffect(() => {
    remoteIds.current = null;
    initialized.current = false;
    reconciledIds.current = new Set();
    lastSyncedKey.current = null;
  }, [fid, uid]);

  // ── 1. Firestore → Store (Echtzeit + Kaltstart + Seeding) ──────────────────
  useEffect(() => {
    if (!fid || !uid) return;
    const unsub = subscribeToImportantTasks(fid, uid, (ids, exists) => {
      if (!exists) {
        // Noch kein Dokument: lokalen Stand NICHT überschreiben, sondern als
        // Basis übernehmen und (falls nicht leer) nach Firestore seeden.
        const localIds = importantGoogleIds(useStore.getState().tasks);
        remoteIds.current = new Set(localIds);
        lastSyncedKey.current = localIds.join(',');
        for (const t of useStore.getState().tasks) {
          if (t.googleEventId) reconciledIds.current.add(t.googleEventId);
        }
        initialized.current = true;
        if (localIds.length) saveImportantTasks(fid, uid, localIds).catch(() => {});
        return;
      }
      const set = new Set(ids);
      remoteIds.current = set;
      applyingRemote.current = true;
      useStore.getState().applyImportantTaskGoogleIds([...set]);
      applyingRemote.current = false;
      // Alle aktuell vorhandenen Tasks gelten jetzt als abgeglichen.
      for (const t of useStore.getState().tasks) {
        if (t.googleEventId) reconciledIds.current.add(t.googleEventId);
      }
      lastSyncedKey.current = [...set].sort().join(',');
      initialized.current = true;
    });
    return unsub;
  }, [fid, uid]);

  // ── 2. Store → Firestore + Nach-Anwendung auf neu importierte Tasks ─────────
  useEffect(() => {
    if (!fid || !uid) return;
    const unsub = useStore.subscribe((state, prev) => {
      if (applyingRemote.current) return;
      if (!initialized.current) return;
      if (state.tasks === prev.tasks) return;

      // (a) Pull-Nachzügler: Tasks, die seit dem letzten Remote-Stand neu im
      //     Store sind (z. B. frisch aus Google importiert) und noch nicht
      //     abgeglichen wurden, bekommen die Remote-Menge nachträglich.
      const remote = remoteIds.current;
      if (remote) {
        const fresh = state.tasks.filter(
          (t) => t.googleEventId && !reconciledIds.current.has(t.googleEventId),
        );
        const needsApply = fresh.some(
          (t) => (t.important ?? false) !== remote.has(t.googleEventId as string),
        );
        if (needsApply) {
          applyingRemote.current = true;
          useStore.getState().applyImportantTaskGoogleIds([...remote]);
          applyingRemote.current = false;
        }
      }
      // Alle aktuell vorhandenen Tasks als abgeglichen vormerken.
      for (const t of state.tasks) {
        if (t.googleEventId) reconciledIds.current.add(t.googleEventId);
      }

      // (b) Push: aktuellen lokalen Stand (nach evtl. Nach-Anwendung) schreiben.
      const ids = importantGoogleIds(useStore.getState().tasks);
      const key = ids.join(',');
      if (key === lastSyncedKey.current) return;
      lastSyncedKey.current = key;
      saveImportantTasks(fid, uid, ids).catch(() => {});
    });
    return unsub;
  }, [fid, uid]);
}
