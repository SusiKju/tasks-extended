/**
 * bambini.ts
 *
 * Zentrale Kinder-Registry pro User (TE-18) in Firestore.
 * Pfad: bambiniByUser/{uid} (ein Dokument mit einem `children`-Array).
 *
 * Strikt privat pro User – wie die Fokus-Kachel (focusTilesByUser) bewusst
 * NICHT unter families/. Jedes Kind trägt nur Name und Geburtsjahr. Die
 * Fußball-Notizen zeigen daraus jahrgangsweise gefilterte Ansichten
 * (siehe FussballKachel + JahrgangSel).
 */

import uuid from 'react-native-uuid';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  loadFussballKachel,
  saveFussballKachel,
  ROSTER_THEME,
  ROSTER_FIELDS,
  defaultJahrgang,
} from './fussballKachel';

export interface Child {
  /** Stabile ID (uuid v4). */
  id: string;
  /** Voller Name (Vor- und Nachname in einem Feld). */
  name: string;
  /** Geburtsjahr, z. B. 2019. 0 = unbekannt. */
  birthYear: number;
  /** Angemeldet seit – ISO 'YYYY-MM-DD', optional ('' = nicht gesetzt) (TE-22). */
  registeredSince: string;
  /** Hat aufgehört (TE-22). */
  stopped: boolean;
  /** Name des Elternteils – optional ('') (TE-26). Wird in den Fußball-Notizen gezeigt. */
  parentName: string;
  /** Nachname – optional ('') (TE-26). */
  lastName: string;
}

const makeId = (): string => String(uuid.v4());

const bambiniDoc = (uid: string) => doc(db, 'bambiniByUser', uid);

/** Firestore-sicheres, defensives Kind. Liefert null, wenn kein Name vorhanden. */
function sanitizeChild(c: any): Child | null {
  const name = String(c?.name ?? '').trim();
  if (!name) return null;
  const birthYear = Number(c?.birthYear);
  return {
    id: String(c?.id ?? '') || makeId(),
    name,
    birthYear: Number.isFinite(birthYear) && birthYear > 0 ? Math.trunc(birthYear) : 0,
    registeredSince: String(c?.registeredSince ?? ''),
    stopped: !!c?.stopped,
    parentName: String(c?.parentName ?? ''),
    lastName: String(c?.lastName ?? ''),
  };
}

/**
 * Sortierung: jüngste Jahrgänge oben (absteigend nach Geburtsjahr), Jahrgang
 * 2018 also ganz unten; innerhalb eines Jahrgangs alphabetisch (TE-21).
 */
function sortChildren(list: Child[]): Child[] {
  return [...list].sort((a, b) => b.birthYear - a.birthYear || a.name.localeCompare(b.name, 'de'));
}

export async function loadBambini(uid: string): Promise<Child[]> {
  const snap = await getDoc(bambiniDoc(uid));
  const raw = snap.exists() ? snap.data() : undefined;
  const list = Array.isArray(raw?.children) ? raw!.children : [];
  return sortChildren(list.map(sanitizeChild).filter((c: Child | null): c is Child => c !== null));
}

export async function saveBambini(uid: string, children: Child[]): Promise<void> {
  const clean = sortChildren(
    children.map(sanitizeChild).filter((c: Child | null): c is Child => c !== null),
  );
  await setDoc(
    bambiniDoc(uid),
    { children: clean, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

/** Kinder eines Jahrgangs filtern (exakt bzw. ab Jahr). */
export function childrenForJahrgang(
  children: Child[],
  sel: { year: number; mode: 'exact' | 'from' },
): Child[] {
  return children.filter((c) =>
    sel.mode === 'from' ? c.birthYear >= sel.year : c.birthYear === sel.year,
  );
}

/** Geburtsjahr aus 'YYYY-MM-DD' ziehen; 0 wenn nicht erkennbar. */
function yearFromISO(iso: string): number {
  const y = Number(iso.split('-')[0]);
  return Number.isFinite(y) && y > 1900 ? y : 0;
}

/**
 * Einmalige Migration der TE-16-Roster-Einträge in die Bambini-Registry (TE-18):
 * Namen aus Feld 0 ("Jahrg. 2019") bekommen Geburtsjahr 2019, Feld 1 ("ab 2020")
 * 2020 – sofern nicht schon ein konkretes Geburtsdatum gesetzt war. Anschließend
 * werden die Jahrgang-Auswahlen so gesetzt, dass die bisherige Ansicht erhalten
 * bleibt, die Einträge geleert und das `rosterMigrated`-Flag gesetzt.
 *
 * Idempotent: läuft nur, solange `rosterMigrated` false ist. Bestehende Kinder
 * werden anhand Name+Jahr dedupliziert.
 */
export async function migrateRosterToBambini(uid: string): Promise<void> {
  if (!uid) return;
  const kachel = await loadFussballKachel(uid, ROSTER_THEME);
  if (kachel.rosterMigrated) return;

  const existing = await loadBambini(uid);
  const seen = new Set(existing.map((c) => `${c.name.toLowerCase()}|${c.birthYear}`));
  const added: Child[] = [];

  ROSTER_FIELDS.forEach((fieldIdx) => {
    const fallbackYear = defaultJahrgang(fieldIdx).year;
    const sec = kachel.sections[fieldIdx];
    (sec?.entries ?? []).forEach((e) => {
      const name = e.name.trim();
      if (!name) return;
      const birthYear = yearFromISO(e.geburtstag) || fallbackYear;
      const key = `${name.toLowerCase()}|${birthYear}`;
      if (seen.has(key)) return;
      seen.add(key);
      added.push({
        id: makeId(),
        name,
        birthYear,
        registeredSince: '',
        stopped: false,
        parentName: '',
        lastName: '',
      });
    });
  });

  // Erst die Kinder schreiben. Schlägt das fehl (z. B. Permission), bricht der
  // Aufrufer-catch ab, BEVOR wir die Kachel als migriert markieren – die alten
  // Roster-Einträge bleiben dann als Quelle erhalten und die Migration läuft
  // beim nächsten Mal erneut.
  if (added.length > 0) await saveBambini(uid, [...existing, ...added]);

  // Jahrgang-Auswahl auf den bisherigen Stand setzen und Migration markieren.
  // Die Roster-Einträge werden bewusst NICHT gelöscht – sie dienen als
  // Cold-Backup, falls die Registry später mal geleert wird. Angezeigt werden
  // sie nicht mehr (JahrgangView speist sich aus der Bambini-Registry).
  const sections = kachel.sections.map((sec, i) =>
    ROSTER_FIELDS.includes(i) ? { ...sec, jahrgang: sec.jahrgang ?? defaultJahrgang(i) } : sec,
  );
  await saveFussballKachel(uid, ROSTER_THEME, sections, { rosterMigrated: true });
}
