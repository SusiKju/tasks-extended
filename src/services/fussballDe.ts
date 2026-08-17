/**
 * fussballDe.ts
 * Vereinsspielplan + Tabelle von fussball.de (DFBnet) pro Kind – nur Lesezugriff.
 *
 * fussball.de schickt auf seinen öffentlichen Ajax-Endpunkten keinen
 * Access-Control-Allow-Origin-Header, ein Browser-fetch() ist also für Web/PWA
 * blockiert (CORS), auch wenn curl/native Clients problemlos durchkommen.
 * Ein eigener Proxy (Cloud Function) hätte den Blaze-Tarif erfordert, den der
 * Nutzer bewusst ablehnt. Lösung: `scripts/sync-fussball-de.mjs` holt und
 * parsed die Daten serverseitig (GitHub Actions Cron) und schreibt sie per
 * Admin-SDK nach Firestore – dieses Modul liest hier nur noch mit.
 *
 * Kein neues Firestore-Rules-Deploy nötig: liegt als Felder `fussballMatches`/
 * `fussballTable` auf families/{familyId}/children/{childId}, wie timetable.ts.
 */

import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

export interface Match {
  /** ISO-Datum YYYY-MM-DD. */
  date: string;
  /** "HH:MM". */
  time: string;
  competition: string;
  home: string;
  away: string;
  isHome: boolean;
  link?: string;
}

export interface Standing {
  rank: number;
  club: string;
  /** Eigene Mannschaft (Vergleich per Team-ID beim Sync). */
  isOwn: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

/** Akzeptiert die volle Team-URL oder bereits die nackte Team-ID. */
export function parseTeamIdFromUrl(input: string): string | null {
  const trimmed = input.trim();
  const m = trimmed.match(/team-id\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{10,}$/.test(trimmed) ? trimmed : null;
}

function childDoc(familyId: string, childId: string) {
  return doc(db, 'families', familyId, 'children', childId);
}

/** Echtzeit-Listener auf den Spielplan eines Kindes. */
export function subscribeToMatches(
  familyId: string,
  childId: string,
  onChange: (matches: Match[]) => void,
): Unsubscribe {
  return onSnapshot(
    childDoc(familyId, childId),
    (snap) => onChange((snap.data()?.fussballMatches as Match[] | undefined) ?? []),
    () => onChange([]),
  );
}

/** Echtzeit-Listener auf die Tabelle eines Kindes. */
export function subscribeToTable(
  familyId: string,
  childId: string,
  onChange: (standings: Standing[]) => void,
): Unsubscribe {
  return onSnapshot(
    childDoc(familyId, childId),
    (snap) => onChange((snap.data()?.fussballTable as Standing[] | undefined) ?? []),
    () => onChange([]),
  );
}
