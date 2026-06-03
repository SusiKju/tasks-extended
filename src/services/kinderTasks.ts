/**
 * kinderTasks.ts
 * Alle Firestore-Operationen für das Kinder-Aufgaben-System.
 *
 * Firestore-Struktur:
 *   children/{childId}/tasks/{taskId}  → ChildTask
 *   children/{childId}/pushToken       → string
 *   config/reminders                   → { times: string[] }
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export type ChildId = 'lenny' | 'emil' | 'hannes' | 'liddy';
export const CHILDREN: ChildId[] = ['lenny', 'emil', 'hannes', 'liddy'];
export const CHILD_NAMES: Record<ChildId, string> = {
  lenny: 'Lenny',
  emil: 'Emil',
  hannes: 'Hannes',
  liddy: 'Liddy',
};

export interface ChildTask {
  id: string;
  title: string;
  done: boolean;
  date: string; // ISO-Datum: "2026-06-02"
  createdAt: string;
  /** ISO-Zeitstempel, wann die Aufgabe abgehakt wurde. null/undefined = noch offen. */
  completedAt?: string | null;
}

// ─── Aufgaben lesen ──────────────────────────────────────────────────────────

export async function getTasksForChild(childId: ChildId, date: string): Promise<ChildTask[]> {
  const snap = await getDocs(collection(db, 'children', childId, 'tasks'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ChildTask))
    .filter((t) => t.date === date);
}

/** Echtzeit-Listener für Eltern-Tab (alle Aufgaben aller Kinder für heute) */
export function subscribeToChildTasks(
  childId: ChildId,
  date: string,
  onChange: (tasks: ChildTask[]) => void
): Unsubscribe {
  return onSnapshot(collection(db, 'children', childId, 'tasks'), (snap) => {
    const tasks = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as ChildTask))
      .filter((t) => t.date === date);
    onChange(tasks);
  });
}

// ─── Aufgaben schreiben (Eltern) ─────────────────────────────────────────────

export async function addTask(childId: ChildId, task: Omit<ChildTask, 'id'>): Promise<string> {
  const ref = doc(collection(db, 'children', childId, 'tasks'));
  await setDoc(ref, task);
  return ref.id;
}

export async function updateTask(
  childId: ChildId,
  taskId: string,
  updates: Partial<ChildTask>
): Promise<void> {
  await updateDoc(doc(db, 'children', childId, 'tasks', taskId), updates as Record<string, unknown>);
}

export async function deleteTask(childId: ChildId, taskId: string): Promise<void> {
  await deleteDoc(doc(db, 'children', childId, 'tasks', taskId));
}

// ─── Abhaken (Kind) ──────────────────────────────────────────────────────────

export async function toggleTask(
  childId: ChildId,
  taskId: string,
  done: boolean
): Promise<void> {
  await updateDoc(doc(db, 'children', childId, 'tasks', taskId), {
    done,
    completedAt: done ? new Date().toISOString() : null,
  });
}

// ─── History (Eltern) ────────────────────────────────────────────────────────

/**
 * Alle erledigten Aufgaben eines Kindes datumsübergreifend.
 * Sortiert nach Erledigungszeitpunkt absteigend (neuste zuerst).
 * Alt-Daten ohne `completedAt` fallen auf `date` zurück.
 */
export async function getCompletedHistory(childId: ChildId): Promise<ChildTask[]> {
  const snap = await getDocs(collection(db, 'children', childId, 'tasks'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ChildTask))
    .filter((t) => t.done)
    .sort((a, b) => (b.completedAt ?? b.date).localeCompare(a.completedAt ?? a.date));
}

// ─── Push-Token ──────────────────────────────────────────────────────────────

export async function savePushToken(childId: ChildId, token: string): Promise<void> {
  await setDoc(doc(db, 'children', childId), { pushToken: token }, { merge: true });
}

export async function getPushTokens(): Promise<Record<ChildId, string | null>> {
  const result: Record<string, string | null> = {};
  for (const childId of CHILDREN) {
    const snap = await getDoc(doc(db, 'children', childId));
    result[childId] = snap.exists() ? (snap.data()?.pushToken ?? null) : null;
  }
  return result as Record<ChildId, string | null>;
}

// ─── Web-Push-Trigger ────────────────────────────────────────────────────────

/** Schreibt einen Push-Trigger für ein Kind in Firestore. */
export async function writePushTrigger(childId: ChildId): Promise<void> {
  await setDoc(doc(db, 'pushTriggers', childId), {
    triggeredAt: new Date().toISOString(),
    childName: CHILD_NAMES[childId],
  });
}

/** Schreibt Push-Trigger für alle Kinder. */
export async function writePushTriggerAll(): Promise<void> {
  await Promise.all(CHILDREN.map((id) => writePushTrigger(id)));
}

/** Hört auf Push-Trigger für ein Kind. Ruft onTrigger() auf wenn ein neuer Trigger ankommt. */
export function subscribeToPushTrigger(childId: ChildId, onTrigger: () => void): Unsubscribe {
  return onSnapshot(doc(db, 'pushTriggers', childId), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (!data?.triggeredAt) return;
    const triggered = new Date(data.triggeredAt).getTime();
    const age = Date.now() - triggered;
    if (age > 60_000) return; // älter als 60s → ignorieren
    onTrigger();
  });
}

// ─── Erinnerungszeiten ───────────────────────────────────────────────────────

export async function getReminderTimes(): Promise<string[]> {
  const snap = await getDoc(doc(db, 'config', 'reminders'));
  if (snap.exists()) return snap.data().times as string[];
  return ['15:00', '17:00']; // Default
}

export async function setReminderTimes(times: string[]): Promise<void> {
  await setDoc(doc(db, 'config', 'reminders'), { times });
}
