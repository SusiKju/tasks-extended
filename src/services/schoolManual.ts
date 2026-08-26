/**
 * schoolManual.ts
 * Manuell gepflegtes Klassenbuch für Kinder ohne Schul-App-Anbindung (Hannes,
 * Emil): ein gemischter, selbst sortierbarer Eintrags-Strom aus Hausaufgaben,
 * Infos und Terminen. Wie timetable.ts/journal.ts bewusst KEINE eigene
 * Firestore-Collection: ein Array-Feld `schoolItems` auf
 * families/{familyId}/children/{childId} – selbes Dokument, schon durch
 * isFamilyMember abgedeckt, kein Rules-Deploy nötig.
 *
 * Reine Elternsache: anders als kinderTasks.ts (Kind-Aufgaben mit Belohnung,
 * Push, Aktivitätslog) gibt es hier keine Kind-Ansicht, kein Push, keine
 * Aktivität – nur Lesen/Schreiben durch die Eltern-App.
 *
 * Reihenfolge ist bewusst manuell (Feld `order`, per Pfeil-Buttons
 * vertauscht) statt automatisch nach Datum – der Elternteil entscheidet,
 * was oben steht. Abgehakte Einträge (`done`) fallen aus der Reihenfolge
 * raus und landen chronologisch (nach `completedAt`) in der History.
 */

import uuid from 'react-native-uuid';
import { doc, setDoc, updateDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

export const makeId = (): string => String(uuid.v4());

function childDoc(familyId: string, childId: string) {
  return doc(db, 'families', familyId, 'children', childId);
}

export type SchoolItemType = 'homework' | 'info' | 'event';

interface SchoolItemBase {
  id: string;
  done: boolean;
  /** Manuelle Sortierposition unter den offenen Einträgen (per Pfeil-Buttons). */
  order: number;
  createdAt: string;
  /** ISO-Zeitstempel des Abhakens. null/undefined = noch offen. */
  completedAt?: string | null;
}

export interface HomeworkItem extends SchoolItemBase {
  type: 'homework';
  /** Fach, z. B. "Deutsch" – leer = kein Fach zugeordnet. */
  subject: string;
  text: string;
}

export interface InfoItem extends SchoolItemBase {
  type: 'info';
  text: string;
}

export interface EventItem extends SchoolItemBase {
  type: 'event';
  title: string;
  /** ISO-Datum "yyyy-MM-dd", '' = kein Datum. */
  date: string;
  /** "HH:MM", '' = keine Uhrzeit. */
  time: string;
  location: string;
  notes: string;
}

export type SchoolItem = HomeworkItem | InfoItem | EventItem;

function sanitizeItem(raw: any, fallbackOrder: number): SchoolItem | null {
  const base = {
    id: String(raw?.id ?? '') || makeId(),
    done: !!raw?.done,
    order: Number.isFinite(raw?.order) ? Number(raw.order) : fallbackOrder,
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    completedAt: raw?.completedAt ? String(raw.completedAt) : null,
  };
  if (raw?.type === 'homework') {
    const text = String(raw?.text ?? '').trim();
    if (!text) return null;
    return { ...base, type: 'homework', subject: String(raw?.subject ?? ''), text };
  }
  if (raw?.type === 'info') {
    const text = String(raw?.text ?? '').trim();
    if (!text) return null;
    return { ...base, type: 'info', text };
  }
  if (raw?.type === 'event') {
    const title = String(raw?.title ?? '').trim();
    if (!title) return null;
    return {
      ...base, type: 'event', title,
      date: String(raw?.date ?? ''), time: String(raw?.time ?? ''),
      location: String(raw?.location ?? ''), notes: String(raw?.notes ?? ''),
    };
  }
  return null;
}

function sanitizeItems(raw: any): SchoolItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r, idx) => sanitizeItem(r, idx))
    .filter((i): i is SchoolItem => i !== null);
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

/** Nächste Sortierposition = eine Position hinter dem letzten offenen Eintrag. */
export function nextOrder(items: SchoolItem[]): number {
  const open = items.filter((i) => !i.done);
  return open.length ? Math.max(...open.map((i) => i.order)) + 1 : 0;
}

/**
 * Vertauscht die Sortierposition eines offenen Eintrags mit seinem Nachbarn
 * (Pfeil-Buttons statt Drag-and-drop). Kein Effekt am Rand der Liste oder
 * auf bereits abgehakte Einträge.
 */
export function moveItem(items: SchoolItem[], id: string, dir: 'up' | 'down'): SchoolItem[] {
  const open = items.filter((i) => !i.done).sort((a, b) => a.order - b.order);
  const idx = open.findIndex((i) => i.id === id);
  const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= open.length) return items;
  const a = open[idx], b = open[swapIdx];
  return items.map((i) => (i.id === a.id ? { ...i, order: b.order } : i.id === b.id ? { ...i, order: a.order } : i));
}
