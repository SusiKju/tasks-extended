/**
 * schoolManual.ts
 * Manuell gepflegtes Klassenbuch für Kinder ohne Schul-App-Anbindung (Hannes,
 * Emil) bzw. ohne Schulpflicht (Liddy): ein gemischter Eintrags-Strom. Wie
 * timetable.ts/journal.ts bewusst KEINE eigene Firestore-Collection: ein
 * Array-Feld `schoolItems` auf families/{familyId}/children/{childId} –
 * selbes Dokument, schon durch isFamilyMember abgedeckt, kein Rules-Deploy
 * nötig.
 *
 * Ein Eintrag ist entweder eine abhakbare Aufgabe oder – mit `isInfo` – eine
 * reine Info ohne Haken (z. B. "Klassenlehrerin: Frau Kohl"). Bewusst EIN
 * einheitliches Feld-Set (Titel/Datum/Notiz) statt separater Typen mit
 * eigenen Feldern (Fach, Ort, Uhrzeit) – ein "+" reicht zum Anlegen.
 *
 * Reihenfolge der offenen Einträge: Einträge mit Datum chronologisch (nächster
 * Termin zuerst), danach Einträge ohne Datum nach neuestem Anlegen/Bearbeiten
 * (`updatedAt`) – bewusst nicht manuell sortierbar.
 *
 * Abhaken und Löschen sind beide nicht destruktiv: `done`/`deletedAt` blenden
 * einen Eintrag nur aus der offenen Liste aus, der Eintrag bleibt im Array
 * erhalten und taucht im Verlauf (History-Dialog) auf, von dort per
 * "wiederherstellen" zurückholbar.
 *
 * Reine Elternsache: anders als kinderTasks.ts (Kind-Aufgaben mit Belohnung,
 * Push, Aktivitätslog) gibt es hier keine Kind-Ansicht, kein Push, keine
 * Aktivität – nur Lesen/Schreiben durch die Eltern-App.
 */

import uuid from 'react-native-uuid';
import { doc, setDoc, updateDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

export const makeId = (): string => String(uuid.v4());

function childDoc(familyId: string, childId: string) {
  return doc(db, 'families', familyId, 'children', childId);
}

export interface SchoolItem {
  id: string;
  title: string;
  /** ISO-Datum "yyyy-MM-dd", '' = kein Datum. */
  date: string;
  notes: string;
  /** true = reine Info, nicht abhakbar (kein Haken, landet nie in der History). */
  isInfo: boolean;
  done: boolean;
  createdAt: string;
  /** ISO-Zeitstempel der letzten Bearbeitung – bestimmt die Sortierung. */
  updatedAt: string;
  /** ISO-Zeitstempel des Abhakens. null/undefined = noch offen. */
  completedAt?: string | null;
  /** ISO-Zeitstempel des (weichen) Löschens. null/undefined = nicht gelöscht. */
  deletedAt?: string | null;
}

/**
 * Migrationspfad für Einträge aus dem vorherigen Drei-Typen-Modell
 * (type: 'homework'|'info'|'event', Titel in `text` bzw. `title`, Sortierung
 * über ein inzwischen entferntes `order`-Feld): Titel wird aus `title` oder
 * `text` übernommen, `isInfo` aus `type === 'info'`, `updatedAt` fällt auf
 * `createdAt` zurück, falls es noch fehlt.
 */
function sanitizeItem(raw: any): SchoolItem | null {
  const legacyText = typeof raw?.text === 'string' ? raw.text.trim() : '';
  const title = String(raw?.title ?? '').trim() || legacyText;
  if (!title) return null;
  const isInfo = raw?.isInfo !== undefined ? !!raw.isInfo : raw?.type === 'info';
  const createdAt = String(raw?.createdAt ?? new Date().toISOString());
  return {
    id: String(raw?.id ?? '') || makeId(),
    title,
    date: String(raw?.date ?? ''),
    notes: String(raw?.notes ?? ''),
    isInfo,
    done: !!raw?.done,
    createdAt,
    updatedAt: String(raw?.updatedAt ?? createdAt),
    completedAt: raw?.completedAt ? String(raw.completedAt) : null,
    deletedAt: raw?.deletedAt ? String(raw.deletedAt) : null,
  };
}

function sanitizeItems(raw: any): SchoolItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeItem).filter((i): i is SchoolItem => i !== null);
}

export function subscribeToSchoolItems(
  familyId: string, childId: string, onChange: (list: SchoolItem[]) => void,
): Unsubscribe {
  return onSnapshot(
    childDoc(familyId, childId),
    (snap) => onChange(sanitizeItems(snap.data()?.schoolItems)),
    () => onChange([]),
  );
}

export async function saveSchoolItems(familyId: string, childId: string, list: SchoolItem[]): Promise<void> {
  const ref = childDoc(familyId, childId);
  const clean = sanitizeItems(list);
  try {
    await updateDoc(ref, { schoolItems: clean });
  } catch {
    await setDoc(ref, { schoolItems: clean }, { merge: true });
  }
}

// ── Kontakte & Kurzinfos (Klassenlehrer, Horterzieher, Telefonnummern, …) ────
// Bewusst getrennt vom Eintrags-Strom oben: feste, schlanke Referenz-Zeilen
// statt Einträge in einer nach Aktualität sortierten, wachsenden Liste – frei
// benennbare Label/Wert-Paare, kein Datum, kein Abhaken, kein Verlauf nötig.

export interface ChildInfoFact {
  id: string;
  label: string;
  /** '' = kein Wert – nur die Bezeichnung ist Pflicht. */
  value: string;
}

function sanitizeFact(raw: any): ChildInfoFact | null {
  const label = String(raw?.label ?? '').trim();
  if (!label) return null;
  return { id: String(raw?.id ?? '') || makeId(), label, value: String(raw?.value ?? '').trim() };
}

function sanitizeFacts(raw: any): ChildInfoFact[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeFact).filter((f): f is ChildInfoFact => f !== null);
}

export function subscribeToInfoFacts(
  familyId: string, childId: string, onChange: (list: ChildInfoFact[]) => void,
): Unsubscribe {
  return onSnapshot(
    childDoc(familyId, childId),
    (snap) => onChange(sanitizeFacts(snap.data()?.infoFacts)),
    () => onChange([]),
  );
}

export async function saveInfoFacts(familyId: string, childId: string, list: ChildInfoFact[]): Promise<void> {
  const ref = childDoc(familyId, childId);
  const clean = sanitizeFacts(list);
  try {
    await updateDoc(ref, { infoFacts: clean });
  } catch {
    await setDoc(ref, { infoFacts: clean }, { merge: true });
  }
}
