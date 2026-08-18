/**
 * journal.ts
 * Klassenbuch-Spiegel pro Kind: offene Hausaufgaben und aktuelle Vertretungen
 * aus beste.schule. Wie grades.ts/timetable.ts bewusst KEINE neue Firestore-
 * Collection: liegt als Feld `journal` auf families/{familyId}/children/{childId}.
 *
 * Nur für beste.schule-synchronisierte Kinder befüllt (siehe SchuleScreen).
 * Kein Archiv: fetchBesteSchuleJournal liefert nur den aktuellen/zukünftigen
 * Ausschnitt, replaceJournal ersetzt den kompletten Stand bei jedem Sync –
 * Vergangenes fällt automatisch raus.
 */

import { doc, setDoc, updateDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

export interface JournalNote {
  /** ISO-Datum (yyyy-MM-dd) des Schultags, dem der Eintrag zugeordnet ist. */
  date: string;
  /** Fach, falls zuordenbar – bei ganztägigen Hinweisen (z.B. Vertretungsplan-Ansage) null. */
  fach: string | null;
  text: string;
}

export interface JournalData {
  homework: JournalNote[];
  substitutions: JournalNote[];
}

const EMPTY: JournalData = { homework: [], substitutions: [] };

function childDoc(familyId: string, childId: string) {
  return doc(db, 'families', familyId, 'children', childId);
}

export function subscribeToJournal(
  familyId: string,
  childId: string,
  onChange: (data: JournalData) => void,
): Unsubscribe {
  return onSnapshot(
    childDoc(familyId, childId),
    (snap) => onChange((snap.data()?.journal as JournalData | undefined) ?? EMPTY),
    () => onChange(EMPTY),
  );
}

/** Ersetzt den kompletten Klassenbuch-Ausschnitt eines Kindes (nach einem Sync). */
export async function replaceJournal(familyId: string, childId: string, data: JournalData): Promise<void> {
  const ref = childDoc(familyId, childId);
  try {
    await updateDoc(ref, { journal: data });
  } catch {
    await setDoc(ref, { journal: data }, { merge: true });
  }
}
