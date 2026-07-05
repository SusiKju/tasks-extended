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
  /**
   * Manuelle Monats-Korrektur (TE-154): überschreibt den regulären Betrag NUR
   * für diesen Monat. null/undefined = keine Korrektur, regulärer Betrag gilt.
   * Folgemonate bleiben unberührt (jede Korrektur steht nur unter ihrem Key).
   */
  overrideAmount?: number | null;
  /** Optionaler Grund für die Korrektur (TE-154), z.B. "geborgt". */
  overrideReason?: string | null;
}

/**
 * Effektiver Taschengeld-Betrag eines Monats: die manuelle Korrektur, falls
 * gesetzt, sonst der regulär konfigurierte Betrag. Zentraler Helfer, damit
 * Eltern-Ansicht und Kind-Ansicht denselben Wert zeigen (TE-154).
 */
export function effectiveAllowance(
  configured: number,
  month?: AllowanceMonth,
): number {
  return month?.overrideAmount != null ? month.overrideAmount : configured;
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

/** Betrag als "12 €" bzw. "12,50 €". */
export function formatEuro(n: number): string {
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
  return `${fixed} €`;
}

const MONTH_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** "YYYY-MM" → "Juni 2026". */
export function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_NAMES_DE[idx] ?? m} ${y}`;
}

/**
 * Monats-Key des nächsten fälligen Taschengelds: der aktuelle Monat, solange er
 * noch nicht bestätigt wurde, sonst der Folgemonat. Taschengeld läuft monatlich
 * (allowanceMonths ist nach "YYYY-MM" gekeyt), einen tagesgenauen Termin gibt es
 * im Modell nicht.
 */
export function nextAllowanceMonth(
  months: Record<string, AllowanceMonth>,
  today: Date = new Date(),
): string {
  const current = monthKey(today);
  if (!months[current]?.received) return current;
  return monthKey(new Date(today.getFullYear(), today.getMonth() + 1, 1));
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

/**
 * Setzt (oder löscht) die manuelle Monats-Korrektur eines Kindes (TE-154).
 * `overrideAmount === null` entfernt die Korrektur (regulärer Betrag gilt wieder).
 * setDoc-merge überschreibt nur die beiden Korrektur-Felder des betroffenen
 * Monats; `received`/`amount`/`confirmedAt` bleiben unangetastet (Firestore
 * merged Map-Felder rekursiv). Legt den Monatseintrag bei Bedarf an.
 */
export async function setAllowanceOverride(
  familyId: string,
  childId: string,
  month: string,
  overrideAmount: number | null,
  overrideReason: string | null = null,
): Promise<void> {
  await setDoc(
    childDoc(familyId, childId),
    {
      allowanceMonths: {
        [month]: {
          overrideAmount,
          // Grund nur behalten, wenn eine Korrektur besteht.
          overrideReason: overrideAmount != null ? overrideReason : null,
        },
      },
    },
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
