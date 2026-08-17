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

import { doc, setDoc, updateDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
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
