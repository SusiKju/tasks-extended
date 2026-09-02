/**
 * bambini.ts
 *
 * Zentrale Kinder-Registry der Familie (TE-18, family-weit seit TE-43) in
 * Firestore. Pfad: families/{familyId}/config/bambini (ein Dokument mit
 * einem `children`-Array).
 *
 * War ursprünglich strikt privat pro User (`bambiniByUser/{uid}`, wie die
 * Fokus-Kachel), auf Familien-Basis umgestellt damit alle Familienmitglieder
 * (z.B. Lenny mit eigenem Account) dieselben Daten sehen wie der Trainer.
 * Jedes Kind trägt nur Name und Geburtsjahr. Die Fußball-Notizen zeigen
 * daraus jahrgangsweise gefilterte Ansichten (siehe FussballKachel +
 * JahrgangSel).
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
  /** Das erste Mal da (erstes Training) – ISO 'YYYY-MM-DD', optional ('' = nicht gesetzt) (TE-22). */
  registeredSince: string;
  /** Hat aufgehört (TE-22). */
  stopped: boolean;
  /** Name des Elternteils – optional ('') (TE-26). Wird in den Fußball-Notizen gezeigt. */
  parentName: string;
  /** Nachname – optional ('') (TE-26). */
  lastName: string;
  /** Freitext für zusätzliche Infos – optional ('') (TE-21). Befüllt → Icon in der Liste. */
  info: string;
  /** In der WhatsApp-Gruppe der Eltern (TE-35). */
  whatsapp: boolean;
  /** Offiziell im Verein angemeldet, unabhängig von `registeredSince` (TE-46). */
  vereinAngemeldet: boolean;
  /** Schnuppertraining – ganz neu, evtl. nur zum Reinschnuppern, noch keine festen Daten (TE-84). */
  schnuppertraining: boolean;
}

/** Sortierung der Bambini-Liste (TE-109): nach Jahrgang oder nach "dabei seit". */
export type BambiniSortMode = 'jahrgang' | 'erstesmal';

/** Quickfilter-Auswahl im Bambini-Tab (TE-20), pro User persistiert. */
export interface BambiniFilters {
  /** Ausgewählte Jahrgänge (Mehrfachauswahl), leer = alle. */
  years: number[];
  /** null = alle, true = nur aufgehört, false = nur aktiv. */
  stopped: boolean | null;
  /** null = alle, true = nur Wackelkandidaten, false = ohne Wackelkandidaten. */
  wackelkandidat: boolean | null;
  /** Sortiermodus der Liste (TE-109). */
  sortMode: BambiniSortMode;
  /** Sortierrichtung umgekehrt (TE-109). */
  sortReversed: boolean;
  /** Filter-/Sortierbereich (Suche, Quickfilter, Sortierung) eingeblendet (TE-110). */
  filtersOpen: boolean;
}

export const makeId = (): string => String(uuid.v4());

const bambiniDoc = (familyId: string) => doc(db, 'families', familyId, 'config', 'bambini');

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
    info: String(c?.info ?? ''),
    whatsapp: !!c?.whatsapp,
    vereinAngemeldet: !!c?.vereinAngemeldet,
    schnuppertraining: !!c?.schnuppertraining,
  };
}

/**
 * Sortierung: Schnuppertraining-Kinder zuerst (TE-84), dann jüngste Jahrgänge
 * oben (absteigend nach Geburtsjahr), Jahrgang 2018 also ganz unten;
 * innerhalb eines Jahrgangs alphabetisch (TE-21).
 */
function sortChildren(list: Child[]): Child[] {
  return [...list].sort(
    (a, b) =>
      Number(b.schnuppertraining) - Number(a.schnuppertraining) ||
      b.birthYear - a.birthYear ||
      a.name.localeCompare(b.name, 'de'),
  );
}

export async function loadBambini(familyId: string): Promise<Child[]> {
  const snap = await getDoc(bambiniDoc(familyId));
  const raw = snap.exists() ? snap.data() : undefined;
  const list = Array.isArray(raw?.children) ? raw!.children : [];
  return sortChildren(list.map(sanitizeChild).filter((c: Child | null): c is Child => c !== null));
}

export async function saveBambini(familyId: string, children: Child[]): Promise<void> {
  const clean = sortChildren(
    children.map(sanitizeChild).filter((c: Child | null): c is Child => c !== null),
  );
  await setDoc(
    bambiniDoc(familyId),
    { children: clean, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

/** Quickfilter-Auswahl (TE-20) laden – liegt im selben Dokument wie die Kinder. */
export async function loadBambiniFilters(familyId: string): Promise<BambiniFilters> {
  const snap = await getDoc(bambiniDoc(familyId));
  const raw = snap.exists() ? (snap.data() as any)?.filters : undefined;
  const years = Array.isArray(raw?.years)
    ? raw.years.filter((y: any) => Number.isFinite(y)).map((y: number) => Math.trunc(y))
    : [];
  const stopped = raw?.stopped === true ? true : raw?.stopped === false ? false : null;
  const wackelkandidat = raw?.wackelkandidat === true ? true : raw?.wackelkandidat === false ? false : null;
  const sortMode: BambiniSortMode = raw?.sortMode === 'erstesmal' ? 'erstesmal' : 'jahrgang';
  const sortReversed = !!raw?.sortReversed;
  const filtersOpen = raw?.filtersOpen !== false;
  return { years, stopped, wackelkandidat, sortMode, sortReversed, filtersOpen };
}

/** Quickfilter-Auswahl (TE-20) speichern. */
export async function saveBambiniFilters(familyId: string, filters: BambiniFilters): Promise<void> {
  await setDoc(bambiniDoc(familyId), { filters }, { merge: true });
}

/** Ein Change-Log-Eintrag eines Notiz-Items (TE-101), z. B. "markiert". */
export interface NotizHistoryEvent {
  ts: string;
  text: string;
}

/** Einzelnes Notiz-Item im Bambini-Tab (TE-101, löste die Freitext-Notizen TE-44 ab). */
export interface NotizItem {
  id: string;
  text: string;
  /** "Fleck" – markiert als wichtig/nächste Aufgabe, erscheint dann auf der Bambini-Startseite. */
  marked: boolean;
  createdAt: string;
  history: NotizHistoryEvent[];
}

function sanitizeNotizItem(n: any): NotizItem | null {
  const text = String(n?.text ?? '').trim();
  if (!text) return null;
  const history = Array.isArray(n?.history)
    ? n.history
        .map((h: any) => ({ ts: String(h?.ts ?? ''), text: String(h?.text ?? '') }))
        .filter((h: NotizHistoryEvent) => h.ts && h.text)
    : [];
  return {
    id: String(n?.id ?? '') || makeId(),
    text,
    marked: !!n?.marked,
    createdAt: String(n?.createdAt ?? '') || new Date().toISOString(),
    history,
  };
}

/** Notiz-Items (TE-101) speichern – liegt im selben Dokument wie die Kinder. */
export async function saveBambiniNotizItems(familyId: string, items: NotizItem[]): Promise<void> {
  const clean = items
    .map(sanitizeNotizItem)
    .filter((n: NotizItem | null): n is NotizItem => n !== null);
  await setDoc(bambiniDoc(familyId), { notizItems: clean }, { merge: true });
}

/**
 * Notiz-Items (TE-101) laden. Migriert einmalig die alte Freitext-Notiz (TE-44,
 * Feld `notizen`) als erstes unmarkiertes Item, damit nichts verloren geht.
 */
export async function loadBambiniNotizItems(familyId: string): Promise<NotizItem[]> {
  const snap = await getDoc(bambiniDoc(familyId));
  const raw = snap.exists() ? (snap.data() as any) : undefined;
  const rawItems = Array.isArray(raw?.notizItems) ? raw.notizItems : null;
  if (rawItems) {
    return rawItems.map(sanitizeNotizItem).filter((n: NotizItem | null): n is NotizItem => n !== null);
  }
  const legacyText = typeof raw?.notizen === 'string' ? raw.notizen.trim() : '';
  if (!legacyText) return [];
  const now = new Date().toISOString();
  const migrated: NotizItem[] = [
    { id: makeId(), text: legacyText, marked: false, createdAt: now, history: [{ ts: now, text: 'aus Freitext-Notizen übernommen' }] },
  ];
  await saveBambiniNotizItems(familyId, migrated);
  return migrated;
}

/** Kinder eines Jahrgangs filtern (exakt bzw. ab Jahr), ohne aufgehörte. */
export function childrenForJahrgang(
  children: Child[],
  sel: { year: number; mode: 'exact' | 'from' },
): Child[] {
  return children.filter(
    (c) => !c.stopped && (sel.mode === 'from' ? c.birthYear >= sel.year : c.birthYear === sel.year),
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
export async function migrateRosterToBambini(familyId: string): Promise<void> {
  if (!familyId) return;
  const kachel = await loadFussballKachel(familyId, ROSTER_THEME);
  if (kachel.rosterMigrated) return;

  const existing = await loadBambini(familyId);
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
        info: '',
        whatsapp: false,
        vereinAngemeldet: false,
        schnuppertraining: false,
      });
    });
  });

  // Erst die Kinder schreiben. Schlägt das fehl (z. B. Permission), bricht der
  // Aufrufer-catch ab, BEVOR wir die Kachel als migriert markieren – die alten
  // Roster-Einträge bleiben dann als Quelle erhalten und die Migration läuft
  // beim nächsten Mal erneut.
  if (added.length > 0) await saveBambini(familyId, [...existing, ...added]);

  // Jahrgang-Auswahl auf den bisherigen Stand setzen und Migration markieren.
  // Die Roster-Einträge werden bewusst NICHT gelöscht – sie dienen als
  // Cold-Backup, falls die Registry später mal geleert wird. Angezeigt werden
  // sie nicht mehr (JahrgangView speist sich aus der Bambini-Registry).
  const sections = kachel.sections.map((sec, i) =>
    ROSTER_FIELDS.includes(i) ? { ...sec, jahrgang: sec.jahrgang ?? defaultJahrgang(i) } : sec,
  );
  await saveFussballKachel(familyId, ROSTER_THEME, sections, { rosterMigrated: true });
}
