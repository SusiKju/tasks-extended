/**
 * allowance.ts
 * Taschengeld pro Kind (TE-52/TE-53/TE-54).
 *
 * Bewusst KEINE neue Firestore-Collection:
 *  - Der konfigurierte Monatsbetrag liegt als Feld `allowance` auf
 *    families/{familyId}/childrenConfig/{childId} (schon vom Kind-Modus gelesen).
 *  - Der Monats-Verlauf liegt als Map `allowanceMonths` auf
 *    families/{familyId}/children/{childId} (key = "YYYY-MM").
 *
 * Beide Dokumente sind durch bestehende Firestore-Rules abgedeckt
 * (isFamilyMember) – kein Rules-Deploy nötig.
 */

import {
  doc,
  updateDoc,
  setDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

/** Ein Monatseintrag im Taschengeld-Verlauf. Map-Key ist "YYYY-MM". */
export interface AllowanceMonth {
  /** Hat das Kind den Erhalt für diesen Monat bestätigt? */
  received: boolean;
  /** Betrag-Snapshot zum Bestätigungszeitpunkt, in EUR. */
  amount: number;
  /** ISO-Zeitstempel der letzten Bestätigung, null wenn zurückgesetzt. */
  confirmedAt: string | null;
}

function childDoc(familyId: string, childId: string) {
  return doc(db, 'families', familyId, 'children', childId);
}
function childConfigDoc(familyId: string, childId: string) {
  return doc(db, 'families', familyId, 'childrenConfig', childId);
}

/** "YYYY-MM" für ein Datum (Default: heute). */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Setzt den konfigurierten Monatsbetrag (Eltern, Settings). null = nicht gesetzt. */
export async function setChildAllowance(
  familyId: string,
  childId: string,
  amount: number | null,
): Promise<void> {
  await updateDoc(childConfigDoc(familyId, childId), { allowance: amount });
}

/**
 * Kind bestätigt oder widerruft den Erhalt für einen Monat. setDoc-merge legt
 * `allowanceMonths` und das Kind-Dokument bei Bedarf an und überschreibt nur
 * den betroffenen Monat (Firestore merged Map-Felder rekursiv).
 */
export async function setAllowanceReceived(
  familyId: string,
  childId: string,
  month: string,
  received: boolean,
  amount: number,
): Promise<void> {
  const entry: AllowanceMonth = {
    received,
    amount,
    confirmedAt: received ? new Date().toISOString() : null,
  };
  await setDoc(
    childDoc(familyId, childId),
    { allowanceMonths: { [month]: entry } },
    { merge: true },
  );
}

/** Echtzeit-Listener auf die Monats-Map eines Kindes. */
export function subscribeToAllowanceMonths(
  familyId: string,
  childId: string,
  onChange: (months: Record<string, AllowanceMonth>) => void,
): Unsubscribe {
  return onSnapshot(
    childDoc(familyId, childId),
    (snap) => {
      const data = snap.data();
      onChange((data?.allowanceMonths as Record<string, AllowanceMonth> | undefined) ?? {});
    },
    () => onChange({}),
  );
}
