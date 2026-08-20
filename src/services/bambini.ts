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
import { differenceInCalendarDays } from 'date-fns';
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
  /** Freitext für zusätzliche Infos – optional ('') (TE-21). Befüllt → Icon in der Liste. */
  info: string;
  /** In der WhatsApp-Gruppe der Eltern (TE-35). */
  whatsapp: boolean;
  /** Offiziell im Verein angemeldet, unabhängig von `registeredSince` (TE-46). */
  vereinAngemeldet: boolean;
}

/** Quickfilter-Auswahl im Bambini-Tab (TE-20), pro User persistiert. */
export interface BambiniFilters {
  /** Ausgewählte Jahrgänge (Mehrfachauswahl), leer = alle. */
  years: number[];
  /** null = alle, true = nur aufgehört, false = nur aktiv. */
  stopped: boolean | null;
}

export const makeId = (): string => String(uuid.v4());

/** Gestaffelte Schwellen für die "neu dabei"-Hervorhebung, in Wochen. */
export const NEU_TIER_WEEKS = [2, 4, 8, 16] as const;
export type NeuTier = (typeof NEU_TIER_WEEKS)[number];

/**
 * Kleinste Wochen-Schwelle (2/4/8/16), die seit `registeredSince` noch nicht
 * überschritten ist – für die gestaffelte Hervorhebung neuer Spieler in der
 * Liste. Liefert null ohne Datum, bei ungültigem Datum, bei einem Datum in
 * der Zukunft oder wenn mehr als 16 Wochen vergangen sind.
 */
export function neuTier(registeredSince: string, now: Date = new Date()): NeuTier | null {
  const [y, m, d] = registeredSince.split('-').map(Number);
  if (!y || !m || !d) return null;
  const days = differenceInCalendarDays(now, new Date(y, m - 1, d));
  if (days < 0) return null;
  const weeks = days / 7;
  return NEU_TIER_WEEKS.find((max) => weeks <= max) ?? null;
}

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
  };
}

/**
 * Sortierung: jüngste Jahrgänge oben (absteigend nach Geburtsjahr), Jahrgang
 * 2018 also ganz unten; innerhalb eines Jahrgangs alphabetisch (TE-21).
 */
function sortChildren(list: Child[]): Child[] {
  return [...list].sort((a, b) => b.birthYear - a.birthYear || a.name.localeCompare(b.name, 'de'));
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
  return { years, stopped };
}

/** Quickfilter-Auswahl (TE-20) speichern. */
export async function saveBambiniFilters(familyId: string, filters: BambiniFilters): Promise<void> {
  await setDoc(bambiniDoc(familyId), { filters }, { merge: true });
}

/** Freitext-Notizen (TE-44) laden – liegt im selben Dokument wie die Kinder. */
export async function loadBambiniNotizen(familyId: string): Promise<string> {
  const snap = await getDoc(bambiniDoc(familyId));
  const raw = snap.exists() ? (snap.data() as any)?.notizen : undefined;
  return typeof raw === 'string' ? raw : '';
}

/** Freitext-Notizen (TE-44) speichern, z. B. Trainingsideen. */
export async function saveBambiniNotizen(familyId: string, notizen: string): Promise<void> {
  await setDoc(bambiniDoc(familyId), { notizen }, { merge: true });
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
