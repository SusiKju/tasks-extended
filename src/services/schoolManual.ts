/**
 * schoolManual.ts
 * Manuell gepflegte Schuldaten für Kinder ohne Schul-App-Anbindung (Hannes,
 * Emil): Hausaufgaben, Infos, Termine. Wie timetable.ts/journal.ts bewusst
 * KEINE eigene Firestore-Collection: je ein Array-Feld auf
 * families/{familyId}/children/{childId} – selbes Dokument, schon durch
 * isFamilyMember abgedeckt, kein Rules-Deploy nötig.
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

async function replaceField(familyId: string, childId: string, field: string, value: unknown): Promise<void> {
  const ref = childDoc(familyId, childId);
  try {
    await updateDoc(ref, { [field]: value });
  } catch {
    await setDoc(ref, { [field]: value }, { merge: true });
  }
}

function subscribeField<T>(
  field: string,
  familyId: string,
  childId: string,
  sanitize: (raw: any) => T[],
  onChange: (list: T[]) => void,
): Unsubscribe {
  return onSnapshot(
    childDoc(familyId, childId),
    (snap) => onChange(sanitize(snap.data()?.[field])),
    () => onChange([]),
  );
}

// ── Hausaufgaben ─────────────────────────────────────────────────────────────

export interface HomeworkEntry {
  id: string;
  /** Fach, z. B. "Deutsch" – leer = kein Fach zugeordnet. */
  subject: string;
  text: string;
  done: boolean;
  createdAt: string;
}

function sanitizeHomework(raw: any): HomeworkEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h) => ({
      id: String(h?.id ?? '') || makeId(),
      subject: String(h?.subject ?? ''),
      text: String(h?.text ?? '').trim(),
      done: !!h?.done,
      createdAt: String(h?.createdAt ?? new Date().toISOString()),
    }))
    .filter((h) => h.text);
}

export function subscribeToHomework(
  familyId: string, childId: string, onChange: (list: HomeworkEntry[]) => void,
): Unsubscribe {
  return subscribeField('homework', familyId, childId, sanitizeHomework, onChange);
}

export function saveHomework(familyId: string, childId: string, list: HomeworkEntry[]): Promise<void> {
  return replaceField(familyId, childId, 'homework', sanitizeHomework(list));
}

// ── Infos ────────────────────────────────────────────────────────────────────

export interface SchoolInfoEntry {
  id: string;
  text: string;
  /** Wichtige Infos oben anpinnen, z. B. Kontakt der Klassenlehrerin. */
  pinned: boolean;
  createdAt: string;
}

function sanitizeInfos(raw: any): SchoolInfoEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i) => ({
      id: String(i?.id ?? '') || makeId(),
      text: String(i?.text ?? '').trim(),
      pinned: !!i?.pinned,
      createdAt: String(i?.createdAt ?? new Date().toISOString()),
    }))
    .filter((i) => i.text);
}

export function subscribeToSchoolInfos(
  familyId: string, childId: string, onChange: (list: SchoolInfoEntry[]) => void,
): Unsubscribe {
  return subscribeField('schoolInfos', familyId, childId, sanitizeInfos, onChange);
}

export function saveSchoolInfos(familyId: string, childId: string, list: SchoolInfoEntry[]): Promise<void> {
  return replaceField(familyId, childId, 'schoolInfos', sanitizeInfos(list));
}

// ── Termine ──────────────────────────────────────────────────────────────────

export interface SchoolEventEntry {
  id: string;
  title: string;
  /** ISO-Datum, "yyyy-MM-dd". */
  date: string;
  /** "HH:MM", '' = keine Uhrzeit. */
  time: string;
  location: string;
  notes: string;
  createdAt: string;
}

function sanitizeEvents(raw: any): SchoolEventEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => ({
      id: String(e?.id ?? '') || makeId(),
      title: String(e?.title ?? '').trim(),
      date: String(e?.date ?? ''),
      time: String(e?.time ?? ''),
      location: String(e?.location ?? ''),
      notes: String(e?.notes ?? ''),
      createdAt: String(e?.createdAt ?? new Date().toISOString()),
    }))
    .filter((e) => e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.date));
}

export function subscribeToSchoolEvents(
  familyId: string, childId: string, onChange: (list: SchoolEventEntry[]) => void,
): Unsubscribe {
  return subscribeField('schoolEvents', familyId, childId, sanitizeEvents, onChange);
}

export function saveSchoolEvents(familyId: string, childId: string, list: SchoolEventEntry[]): Promise<void> {
  return replaceField(familyId, childId, 'schoolEvents', sanitizeEvents(list));
}
