/**
 * fussballKachel.ts
 *
 * Persistente, nicht löschbare Fokus-Kachel pro User in Firestore.
 * Pfad: focusTilesByUser/{uid}/themes/{theme}
 *
 * Strikt privat pro User – bewusst NICHT unter families/, damit die Daten
 * weder mit der Familie geteilt werden noch eine Familienmitgliedschaft
 * voraussetzen. Es gibt genau EINE Kachel je User und Thema (kein Hinzufügen/
 * Löschen). Jedes Thema (fussball/yoga/garten) hat ein eigenes Dokument mit
 * vier unabhängigen Notizabschnitten (2×2-Raster) und eigenen Default-Titeln.
 */

import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FunTileTheme } from '../types';

/**
 * Strukturierter Listeneintrag der Namensliste (TE-16). Alle Felder sind
 * Strings (nie `undefined`), damit Firestore sie unverändert speichert;
 * Optionalität wird über den leeren String ('') ausgedrückt.
 */
export interface RosterEntry {
  /**
   * Vollständiger Name (Vor- und Nachname in einem Feld) – Pflichtfeld;
   * komplett leere Einträge werden beim Speichern verworfen.
   */
  name: string;
  /** Geburtstag als ISO 'YYYY-MM-DD' – optional ('' = nicht gesetzt). */
  geburtstag: string;
  /** Emoji aus fixer Vorauswahl – optional ('' = kein Icon). */
  icon: string;
}

export interface FussballAbschnitt {
  /** Frei benennbarer Titel des Notizabschnitts. */
  title: string;
  /** Freitext – unterstützt Zeilenumbrüche und Aufzählungen (z. B. "- Max"). */
  body: string;
  /**
   * Strukturierte Namensliste (TE-16). Nur in den Roster-Feldern des
   * fussball-Themas befüllt; sonst leeres Array.
   */
  entries: RosterEntry[];
}

export interface FussballKachelData {
  sections: FussballAbschnitt[];
}

/** Thema, dessen erste zwei Felder als Namensliste geführt werden (TE-16). */
export const ROSTER_THEME: FunTileTheme = 'fussball';
/** Feld-Indizes (im 2×2-Raster), die als Namensliste geführt werden. */
export const ROSTER_FIELDS = [0, 1];

/** True, wenn Feld `i` des Themas als strukturierte Namensliste geführt wird. */
export function isRosterField(theme: FunTileTheme, i: number): boolean {
  return theme === ROSTER_THEME && ROSTER_FIELDS.includes(i);
}

/** Vier Default-Abschnitte je Thema – Titel sind frei überschreibbar. */
const DEFAULT_TITLES_BY_THEME: Record<FunTileTheme, Omit<FussballAbschnitt, 'entries'>[]> = {
  fussball: [
    { title: 'akt. Abgänge Jahrg. 2019', body: '' },
    { title: 'ab 2020', body: '' },
    { title: 'Trainingsideen', body: '' },
    { title: 'Turniere', body: '' },
  ],
  yoga: [
    { title: 'Morgen-Flow', body: '' },
    { title: 'Atemübungen', body: '' },
    { title: 'Lieblings-Asanas', body: '' },
    { title: 'Ziele', body: '' },
  ],
  garten: [
    { title: 'Aussaat', body: '' },
    { title: 'Gießplan', body: '' },
    { title: 'Ernte', body: '' },
    { title: 'Besorgungen', body: '' },
  ],
};

export function defaultSections(theme: FunTileTheme): FussballAbschnitt[] {
  return (DEFAULT_TITLES_BY_THEME[theme] ?? DEFAULT_TITLES_BY_THEME.fussball).map((d) => ({
    ...d,
    entries: [],
  }));
}

const kachelDoc = (uid: string, theme: FunTileTheme) =>
  doc(db, 'focusTilesByUser', uid, 'themes', theme);

/**
 * Coerce a possibly-partial / legacy roster entry to the all-string shape
 * (Firestore-safe). Ein früher getrennt gespeicherter `nachname` (vor der
 * Vereinfachung auf ein einziges Namensfeld) wird in `name` zusammengeführt.
 */
function sanitizeEntry(e: Record<string, any> | undefined): RosterEntry {
  const name = String(e?.name ?? e?.vorname ?? '');
  const legacyNachname = String(e?.nachname ?? '').trim();
  return {
    name: legacyNachname ? `${name} ${legacyNachname}`.trim() : name,
    geburtstag: String(e?.geburtstag ?? ''),
    icon: String(e?.icon ?? ''),
  };
}

/** True, wenn alle Felder leer sind – solche Einträge werden nicht persistiert. */
function isEmptyEntry(e: RosterEntry): boolean {
  return !e.name.trim() && !e.geburtstag && !e.icon;
}

/**
 * Migriert alten, durchnummerierten Freitext (TE-15) in strukturierte
 * Einträge: jede Zeile wird zu einem Eintrag mit nur gesetztem Namen.
 * Das Nummern-Präfix ("1. ") wird entfernt.
 */
function entriesFromBody(body: string): RosterEntry[] {
  return body
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\.\s?/, '').trim())
    .filter((name) => name !== '')
    .map((name) => sanitizeEntry({ name }));
}

/** Roster-Einträge eines Feldes ableiten: vorhandene entries, sonst Body-Migration. */
function rosterEntries(raw?: FussballAbschnitt): RosterEntry[] {
  if (raw?.entries && raw.entries.length > 0) {
    return raw.entries.map(sanitizeEntry).filter((e) => !isEmptyEntry(e));
  }
  if (raw?.body) return entriesFromBody(raw.body);
  return [];
}

/**
 * Genau vier Abschnitte garantieren – fehlende mit Themen-Defaults auffüllen.
 * Roster-Felder (TE-16) tragen strukturierte `entries` und leeren `body`,
 * alle übrigen Felder Freitext-`body` und ein leeres `entries`-Array.
 */
function normalize(theme: FunTileTheme, sections?: FussballAbschnitt[]): FussballAbschnitt[] {
  return defaultSections(theme).map((def, i) => {
    const raw = sections?.[i];
    const title = raw?.title ?? def.title;
    if (isRosterField(theme, i)) {
      return { title, body: '', entries: rosterEntries(raw) };
    }
    return { title, body: raw?.body ?? def.body, entries: [] };
  });
}

/**
 * Einmaliges Laden der Kachel des Users für ein Thema. Liefert immer vier
 * Abschnitte – auch wenn das Dokument noch nicht existiert.
 */
export async function loadFussballKachel(
  uid: string,
  theme: FunTileTheme,
): Promise<FussballKachelData> {
  const snap = await getDoc(kachelDoc(uid, theme));
  const raw = snap.exists() ? (snap.data() as FussballKachelData) : undefined;
  return { sections: normalize(theme, raw?.sections) };
}

/** Abschnitte speichern (Dokument wird bei Bedarf angelegt). */
export async function saveFussballKachel(
  uid: string,
  theme: FunTileTheme,
  sections: FussballAbschnitt[],
): Promise<void> {
  await setDoc(
    kachelDoc(uid, theme),
    { sections: normalize(theme, sections), updatedAt: new Date().toISOString() },
    { merge: true },
  );
}
