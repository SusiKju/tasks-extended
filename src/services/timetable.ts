/**
 * timetable.ts
 * Stundenplan pro Kind.
 *
 * Bewusst KEINE neue Firestore-Collection: liegt als Feld `timetable`
 * (Map, Key = "Tag-Stunde" z. B. "1-3" = Montag/3. Stunde) auf
 * families/{familyId}/children/{childId} – selbes Dokument wie
 * allowanceMonths (siehe allowance.ts), schon durch isFamilyMember
 * abgedeckt, kein Rules-Deploy nötig.
 */

import { doc, setDoc, updateDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

export interface TimetableEntry {
  fach: string;
  raum: string;
  lehrer: string;
  /** Mittags-/Essenspause statt Unterricht (siehe besteSchule.ts, Code "07/1"). */
  pause?: boolean;
}

/** Key = "Tag-Stunde", Tag 1=Montag..5=Freitag, Stunde = Period.nr. */
export type TimetableMap = Record<string, TimetableEntry>;

export interface Period {
  nr: number | string;
  start: string;
  end: string;
  pause?: boolean;
  label?: string;
}

export const PERIODS: Period[] = [
  { nr: 1, start: '08:00', end: '08:45' },
  { nr: 2, start: '08:45', end: '09:30' },
  { nr: 'P1', start: '09:30', end: '09:50', pause: true, label: 'Pause' },
  { nr: 3, start: '09:50', end: '10:35' },
  { nr: 4, start: '10:35', end: '11:20' },
  { nr: 'P2', start: '11:20', end: '11:30', pause: true, label: 'Pause' },
  { nr: 5, start: '11:30', end: '12:15' },
  { nr: 6, start: '12:15', end: '13:00' },
  { nr: 7, start: '13:00', end: '13:45' },
  { nr: 8, start: '13:45', end: '14:30' },
  { nr: 9, start: '14:30', end: '15:15' },
  { nr: 10, start: '15:15', end: '16:00' },
];

export const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

/** Feste Fach-Farben (bewusst NICHT durch theme.mono() geschickt – Fächer
 * sollen wie Kind-Avatare als Inhaltsfarbe unterscheidbar bleiben, nicht
 * zu Graustufen werden). Abgestimmt auf den dunklen App-Hintergrund. */
export const SUBJECTS: Record<string, string> = {
  Deutsch: '#E08D74',
  Mathe: '#7EA2D8',
  Englisch: '#6BBCAE',
  Sport: '#E0A855',
  Musik: '#B096D9',
  Kunst: '#DD8FB2',
  Sachunterricht: '#A3C470',
  Religion: '#8FB3BC',
};
export const FALLBACK_SUBJECT_COLOR = '#9AA6B2';

export function subjectColor(fach: string): string {
  return SUBJECTS[fach] ?? FALLBACK_SUBJECT_COLOR;
}

/** Key für ein Slot (Tag 0-4 = Mo-Fr, Stunden-Nr aus PERIODS). */
export function key(dayIdx: number, nr: number | string): string {
  return `${dayIdx + 1}-${nr}`;
}

/** Pro-Kind-Override der Uhrzeiten aus PERIODS, Key = Period.nr als String.
 * Nur relevant für manuell gepflegte Kinder (keine beste.schule-Anbindung) –
 * deren Zeiten/Pausen weichen von der Schule des Sync-Kindes ab. */
export type PeriodTimesMap = Record<string, { start: string; end: string }>;

function sanitizeTime(v: any): string {
  const s = String(v ?? '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : '';
}

function sanitizePeriodTimes(raw: any): PeriodTimesMap {
  const out: PeriodTimesMap = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      const start = sanitizeTime((v as any)?.start);
      const end = sanitizeTime((v as any)?.end);
      if (start && end) out[k] = { start, end };
    }
  }
  return out;
}

/** Wendet gespeicherte Zeit-Overrides auf die Default-Periods an. */
export function applyPeriodTimes(periods: Period[], overrides: PeriodTimesMap): Period[] {
  return periods.map((p) => {
    const o = overrides[String(p.nr)];
    return o ? { ...p, start: o.start, end: o.end } : p;
  });
}

/** Echtzeit-Listener auf die Zeit-Overrides eines Kindes. */
export function subscribeToPeriodTimes(
  familyId: string,
  childId: string,
  onChange: (map: PeriodTimesMap) => void,
): Unsubscribe {
  return onSnapshot(
    childDoc(familyId, childId),
    (snap) => onChange(sanitizePeriodTimes(snap.data()?.periodTimes)),
    () => onChange({}),
  );
}

/** Setzt (oder löscht mit start/end='') die Uhrzeit einer Stunde/Pause. */
export async function setPeriodTime(
  familyId: string,
  childId: string,
  nr: number | string,
  start: string,
  end: string,
): Promise<void> {
  const valid = sanitizeTime(start) && sanitizeTime(end);
  await setDoc(
    childDoc(familyId, childId),
    { periodTimes: { [String(nr)]: valid ? { start, end } : null } },
    { merge: true },
  );
}

/** Heutiger Wochentag als Index 0-4 (Mo-Fr), -1 am Wochenende. */
export function todayDayIndex(): number {
  const day = new Date().getDay(); // 0=So .. 6=Sa
  return day >= 1 && day <= 5 ? day - 1 : -1;
}

function childDoc(familyId: string, childId: string) {
  return doc(db, 'families', familyId, 'children', childId);
}

function sanitizeEntry(raw: any): TimetableEntry | null {
  const fach = String(raw?.fach ?? '').trim();
  if (!fach) return null;
  return {
    fach,
    raum: String(raw?.raum ?? ''),
    lehrer: String(raw?.lehrer ?? ''),
    ...(raw?.pause === true ? { pause: true } : {}),
  };
}

function sanitizeMap(raw: any): TimetableMap {
  const out: TimetableMap = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      const entry = sanitizeEntry(v);
      if (entry) out[k] = entry;
    }
  }
  return out;
}

/** Echtzeit-Listener auf den Stundenplan eines Kindes. */
export function subscribeToTimetable(
  familyId: string,
  childId: string,
  onChange: (map: TimetableMap) => void,
): Unsubscribe {
  return onSnapshot(
    childDoc(familyId, childId),
    (snap) => onChange(sanitizeMap(snap.data()?.timetable)),
    () => onChange({}),
  );
}

/** Setzt (oder löscht mit entry=null) eine Stunde. */
export async function setTimetableEntry(
  familyId: string,
  childId: string,
  slotKey: string,
  entry: TimetableEntry | null,
): Promise<void> {
  await setDoc(
    childDoc(familyId, childId),
    { timetable: { [slotKey]: entry } },
    { merge: true },
  );
}

/**
 * Ersetzt den KOMPLETTEN Stundenplan eines Kindes (z. B. nach einem
 * externen Sync, siehe besteSchule.ts). Anders als setTimetableEntry ein
 * `updateDoc` ohne Merge auf Feldebene – alte, in der Quelle nicht mehr
 * vorhandene Stunden bleiben sonst als Karteileichen liegen.
 */
export async function replaceTimetable(
  familyId: string,
  childId: string,
  map: TimetableMap,
): Promise<void> {
  const ref = childDoc(familyId, childId);
  try {
    await updateDoc(ref, { timetable: map });
  } catch {
    // Dokument existiert noch nicht (erster Sync für dieses Kind) – anlegen.
    await setDoc(ref, { timetable: map }, { merge: true });
  }
}
