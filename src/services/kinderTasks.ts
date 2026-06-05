/**
 * kinderTasks.ts
 * Alle Firestore-Operationen für das Kinder-Aufgaben-System.
 *
 * Firestore-Struktur:
 *   children/{childId}/tasks/{taskId}     → ChildTask
 *   children/{childId}/activity/{autoId}  → ActivityEntry
 *   children/{childId}/pushToken          → string
 *   config/reminders                      → { times: string[] }
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
  query,
  orderBy,
  limit,
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
  /** true = Eltern haben die abgehakte Aufgabe abgelehnt (zurückgesetzt). Wird in der
   *  Kinder-Ansicht rot dargestellt. Sobald das Kind erneut abhakt, wird das Flag gelöscht. (TE-103) */
  rejected?: boolean;
  /** Gemeinsame ID aller Kopien einer Gruppenaufgabe (an mehrere Kinder zugleich vergeben).
   *  null/undefined = normale Einzelaufgabe. Jede Kopie bleibt pro Kind eigenständig
   *  (eigener Status, eigene Belohnungslogik). (TE-111) */
  groupId?: string | null;
}

// ─── Belohnungspakete (TE-101) ────────────────────────────────────────────────
// Belohnung wird freigeschaltet, sobald das Kind an einem Tag ALLE Aufgaben
// erledigt hat ("Alle Tagesaufgaben"-Logik). Pro Kind eine stehende Belohnung.

export type RewardType = 'tv_series' | 'tv_movie' | 'screen_time' | 'sweet' | 'other';

/** Vordefinierte Belohnungstypen mit Emoji + Label (Auswahlliste in der Eltern-UI).
 *  Das Label ist die Hauptaussage für das Kind (auch ohne Lesen erkennbar am Emoji). */
export const REWARD_TYPES: Record<RewardType, { emoji: string; label: string }> = {
  tv_series:   { emoji: '📺', label: 'TV-Serie' },
  tv_movie:    { emoji: '🎬', label: 'TV-Film' },
  screen_time: { emoji: '📱', label: 'Handyzeit' },
  sweet:       { emoji: '🍬', label: 'Süßigkeiten' },
  other:       { emoji: '🎁', label: 'Sonstiges' },
};

export interface ChildReward {
  type: RewardType;
  /** Optionaler Freitext als Detail, z. B. "1 Folge Paw Patrol". Leer = nur der Typ zählt. */
  title?: string;
}

// ─── Aktivitätslog (TE-97) ────────────────────────────────────────────────────

/** Wer hat die Aktion ausgeführt. */
export type Actor = 'parent' | 'child';

/** Welche Aktion wurde protokolliert. */
export type ActivityAction = 'created' | 'completed' | 'reopened' | 'edited' | 'deleted';

export interface ActivityEntry {
  id: string;
  action: ActivityAction;
  taskId: string;
  /** Titel-Snapshot zum Zeitpunkt der Aktion (wichtig bei `deleted`). */
  taskTitle: string;
  actor: Actor;
  /** ISO-Zeitstempel der Aktion. */
  at: string;
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

export async function addTask(
  childId: ChildId,
  task: Omit<ChildTask, 'id'>,
  actor: Actor = 'parent'
): Promise<string> {
  const ref = doc(collection(db, 'children', childId, 'tasks'));
  await setDoc(ref, task);
  await logActivity(childId, {
    action: 'created',
    taskId: ref.id,
    taskTitle: task.title,
    actor,
    at: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateTask(
  childId: ChildId,
  taskId: string,
  updates: Partial<ChildTask>,
  opts?: { actor?: Actor; title?: string }
): Promise<void> {
  await updateDoc(doc(db, 'children', childId, 'tasks', taskId), updates as Record<string, unknown>);
  await logActivity(childId, {
    action: 'edited',
    taskId,
    taskTitle: opts?.title ?? updates.title ?? '',
    actor: opts?.actor ?? 'parent',
    at: new Date().toISOString(),
  });
}

export async function deleteTask(
  childId: ChildId,
  taskId: string,
  opts?: { actor?: Actor; title?: string }
): Promise<void> {
  await deleteDoc(doc(db, 'children', childId, 'tasks', taskId));
  await logActivity(childId, {
    action: 'deleted',
    taskId,
    taskTitle: opts?.title ?? '',
    actor: opts?.actor ?? 'parent',
    at: new Date().toISOString(),
  });
}

export async function deleteCompletedTasks(
  childId: ChildId,
  tasks: ChildTask[]
): Promise<void> {
  const completed = tasks.filter((t) => t.done);
  await Promise.all(
    completed.map((t) => deleteTask(childId, t.id, { actor: 'parent', title: t.title }))
  );
}

// ─── Abhaken (Kind) ──────────────────────────────────────────────────────────

export async function toggleTask(
  childId: ChildId,
  taskId: string,
  done: boolean,
  opts?: { actor?: Actor; title?: string }
): Promise<void> {
  await updateDoc(doc(db, 'children', childId, 'tasks', taskId), {
    done,
    completedAt: done ? new Date().toISOString() : null,
    // Eine Aktion des Kindes hebt eine Eltern-Ablehnung immer auf (TE-103).
    rejected: false,
  });
  await logActivity(childId, {
    action: done ? 'completed' : 'reopened',
    taskId,
    taskTitle: opts?.title ?? '',
    actor: opts?.actor ?? 'child',
    at: new Date().toISOString(),
  });
}

// ─── Ablehnen (Eltern) ───────────────────────────────────────────────────────

/**
 * Eltern setzen eine vom Kind abgehakte Aufgabe wieder auf "offen" und markieren sie
 * als abgelehnt (`rejected`). Das Kind sieht sie dann rot ("nicht akzeptiert"). Sobald
 * das Kind sie erneut abhakt, löscht `toggleTask` das Flag wieder. (TE-103) */
export async function rejectTask(
  childId: ChildId,
  taskId: string,
  opts?: { title?: string }
): Promise<void> {
  await updateDoc(doc(db, 'children', childId, 'tasks', taskId), {
    done: false,
    completedAt: null,
    rejected: true,
  });
  await logActivity(childId, {
    action: 'reopened',
    taskId,
    taskTitle: opts?.title ?? '',
    actor: 'parent',
    at: new Date().toISOString(),
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

// ─── Aktivitätslog lesen/schreiben (TE-97) ───────────────────────────────────

/** Schreibt ein Event in den Aktivitätslog eines Kindes. Fehler werden geschluckt
 *  (ein fehlgeschlagenes Log darf die eigentliche Mutation nie blockieren). */
export async function logActivity(
  childId: ChildId,
  entry: Omit<ActivityEntry, 'id'>
): Promise<void> {
  try {
    const ref = doc(collection(db, 'children', childId, 'activity'));
    await setDoc(ref, entry);
  } catch (e) {
    console.warn('logActivity fehlgeschlagen', e);
  }
}

/**
 * Aktivitätslog eines Kindes, neuste zuerst.
 * Auf die letzten `max` Events begrenzt (Default 100).
 */
export async function getActivityLog(childId: ChildId, max = 100): Promise<ActivityEntry[]> {
  const q = query(
    collection(db, 'children', childId, 'activity'),
    orderBy('at', 'desc'),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityEntry));
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

// ─── Belohnung lesen/schreiben (TE-101) ──────────────────────────────────────
// Liegt auf dem Kind-Dokument `children/{childId}` (Feld `reward`), analog zu
// `pushToken`. `null` = keine Belohnung gesetzt.

export async function setChildReward(childId: ChildId, reward: ChildReward | null): Promise<void> {
  await setDoc(doc(db, 'children', childId), { reward }, { merge: true });
}

export async function getChildReward(childId: ChildId): Promise<ChildReward | null> {
  const snap = await getDoc(doc(db, 'children', childId));
  return snap.exists() ? ((snap.data()?.reward as ChildReward | undefined) ?? null) : null;
}

/** Echtzeit-Listener für die Belohnung eines Kindes. */
export function subscribeToChildReward(
  childId: ChildId,
  onChange: (reward: ChildReward | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'children', childId), (snap) => {
    onChange(snap.exists() ? ((snap.data()?.reward as ChildReward | undefined) ?? null) : null);
  });
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
