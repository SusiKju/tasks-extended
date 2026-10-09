/**
 * grades.ts
 * Zensuren-Spiegel pro Kind (Fach -> Liste von Noten). Wie timetable.ts
 * bewusst KEINE neue Firestore-Collection: liegt als Feld `grades` auf
 * families/{familyId}/children/{childId}, selbes Dokument, keine
 * Rules-Änderung nötig.
 *
 * Nur für beste.schule-synchronisierte Kinder befüllt (siehe SchuleScreen) –
 * kein manuelles Noten-Eintragen in dieser Version.
 */

import { doc, setDoc, updateDoc, arrayUnion, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

export interface GradeEntry {
  /** Notenwert wie von beste.schule geliefert (Zahl oder Text, z. B. "2+"). */
  value: string;
  /** Art der Leistung, z. B. Klausur/mündlich – falls von der Quelle geliefert. */
  type?: string;
  /** Datum, falls geliefert (ISO oder wie von der Quelle geliefert). */
  date?: string;
  /** Rohobjekt der Quelle – falls das Feld-Mapping oben mal daneben liegt, geht nichts verloren. */
  raw: unknown;
}

/** Key = Fachname. */
export type GradesMap = Record<string, GradeEntry[]>;

function childDoc(familyId: string, childId: string) {
  return doc(db, 'families', familyId, 'children', childId);
}

export function subscribeToGrades(
  familyId: string,
  childId: string,
  onChange: (map: GradesMap) => void,
): Unsubscribe {
  return onSnapshot(
    childDoc(familyId, childId),
    (snap) => onChange((snap.data()?.grades as GradesMap | undefined) ?? {}),
    () => onChange({}),
  );
}

/** Ersetzt den kompletten Noten-Stand eines Kindes (nach einem Sync). */
export async function replaceGrades(familyId: string, childId: string, map: GradesMap): Promise<void> {
  const ref = childDoc(familyId, childId);
  try {
    await updateDoc(ref, { grades: map });
  } catch {
    await setDoc(ref, { grades: map }, { merge: true });
  }
}

/**
 * TE-53: Farbe passend zur Note (Schulnoten 1–6, Tendenz „+“/„-“):
 * 1 grün → 2 hellgrün → 3 gelb → 4 orange → 5/6 rot. Nicht als Note
 * lesbare Werte (z. B. „teilgenommen“) → null, Aufrufer nimmt eine Ersatzfarbe.
 */
export function gradeColor(value: string): string | null {
  const m = /^\s*([1-6])\s*([+-]?)/.exec(String(value));
  if (!m) return null;
  const n = Number(m[1]) + (m[2] === '+' ? -0.3 : m[2] === '-' ? 0.3 : 0);
  if (n <= 1.5) return '#22C55E';
  if (n <= 2.5) return '#84CC16';
  if (n <= 3.5) return '#EAB308';
  if (n <= 4.5) return '#F97316';
  if (n <= 5.5) return '#EF4444';
  return '#B91C1C';
}

export function gradeId(entry: GradeEntry): string | null {
  const id = (entry.raw as { id?: string | number } | null)?.id;
  return id != null ? String(id) : null;
}

/**
 * Von beste.schule als ungelesen gemeldete Noten, die hier noch nicht per
 * `ackGrades` bestätigt wurden. `replaceGrades` überschreibt bei jedem Sync
 * die komplette `grades`-Map – der Gelesen-Status darf deshalb nicht darin
 * stecken, sondern lebt separat in `gradesAckIds` auf demselben Dokument.
 */
export function unreadGradeIds(map: GradesMap, ackIds: string[]): string[] {
  const acked = new Set(ackIds);
  const ids: string[] = [];
  for (const entries of Object.values(map)) {
    for (const entry of entries) {
      if ((entry.raw as { read?: boolean } | null)?.read !== false) continue;
      const id = gradeId(entry);
      if (id && !acked.has(id)) ids.push(id);
    }
  }
  return ids;
}

export function subscribeToGradesAck(
  familyId: string,
  childId: string,
  onChange: (ackIds: string[]) => void,
): Unsubscribe {
  return onSnapshot(
    childDoc(familyId, childId),
    (snap) => onChange((snap.data()?.gradesAckIds as string[] | undefined) ?? []),
    () => onChange([]),
  );
}

/** Markiert die übergebenen Noten als gelesen ("Als gelesen markieren"). */
export async function ackGrades(familyId: string, childId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const ref = childDoc(familyId, childId);
  try {
    await updateDoc(ref, { gradesAckIds: arrayUnion(...ids) });
  } catch {
    await setDoc(ref, { gradesAckIds: ids }, { merge: true });
  }
}
