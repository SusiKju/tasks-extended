/**
 * kinderTasks.ts
 * Alle Firestore-Operationen für das Kinder-Aufgaben-System.
 *
 * Firestore-Struktur (multi-tenant):
 *   families/{familyId}/children/{childId}/tasks/{taskId}     → ChildTask
 *   families/{familyId}/children/{childId}/activity/{autoId}  → ActivityEntry
 *   families/{familyId}/children/{childId}                    → { pushToken, reward }
 *   families/{familyId}/config/reminders                      → { times: string[] }
 *   families/{familyId}/pushTriggers/{childId}                → { triggeredAt }
 *
 * Alle öffentlichen Funktionen erwarten familyId als ersten Parameter.
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

/** @deprecated Wird durch dynamische Kinder aus Firestore ersetzt (Task 5).
 *  Bleibt temporär für die Migration und Legacy-Code. */
export type ChildId = 'lenny' | 'emil' | 'hannes' | 'liddy';
/** @deprecated */
export const CHILDREN: ChildId[] = ['lenny', 'emil', 'hannes', 'liddy'];
/** @deprecated */
export const CHILD_NAMES: Record<ChildId, string> = {
  lenny: 'Lenny', emil: 'Emil', hannes: 'Hannes', liddy: 'Liddy',
};
/** @deprecated */
export const CHILD_SHORT: Record<ChildId, string> = {
  lenny: 'Len', emil: 'Emi', hannes: 'Han', liddy: 'Lid',
};

// ── Firestore-Pfad-Helfer (familyId-Namespace) ────────────────────────────────

function childDoc(familyId: string, childId: string) {
  return doc(db, 'families', familyId, 'children', childId);
}
function tasksCol(familyId: string, childId: string) {
  return collection(db, 'families', familyId, 'children', childId, 'tasks');
}
function taskDoc(familyId: string, childId: string, taskId: string) {
  return doc(db, 'families', familyId, 'children', childId, 'tasks', taskId);
}
function activityCol(familyId: string, childId: string) {
  return collection(db, 'families', familyId, 'children', childId, 'activity');
}
function configDoc(familyId: string) {
  return doc(db, 'families', familyId, 'config', 'reminders');
}
function emailConfigDoc(familyId: string) {
  return doc(db, 'families', familyId, 'config', 'emailReminders');
}
function pushTriggerDoc(familyId: string, childId: string) {
  return doc(db, 'families', familyId, 'pushTriggers', childId);
}

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
  /** Alle bei dieser Gruppenaufgabe teilnehmenden Kinder (zum Erstellzeitpunkt).
   *  Auf jeder Kopie gespeichert, damit Eltern- UND Kinder-App die Teilnehmer ohne
   *  Cross-Collection-Zugriff anzeigen können. (TE-113/TE-114) */
  groupChildren?: ChildId[];
  /** Optionale Belohnung für genau diese Aufgabe (TE-61). undefined/null = keine.
   *  Default beim Anlegen ist immer "keine". Bei Gruppenaufgaben trägt jede Kopie
   *  dieselbe Belohnung, wird aber pro Kind eigenständig freigegeben. */
  reward?: ChildReward | null;
  /** true = Eltern haben die Belohnung dieser Aufgabe freigegeben. Eine Belohnung
   *  gilt erst als verdient, wenn das Kind die Aufgabe abgehakt hat UND die Eltern
   *  sie anschließend freigeben (TE-61). */
  rewardReleased?: boolean;
}

// ─── Belohnungspakete (TE-101 → TE-61) ───────────────────────────────────────
// Belohnung hängt seit TE-61 pro Aufgabe (ChildTask.reward), nicht mehr pro Kind.
// Sie wird verdient, sobald das Kind die Aufgabe abhakt und die Eltern sie über
// rewardReleased freigeben.

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

export async function getTasksForChild(familyId: string, childId: string, date: string): Promise<ChildTask[]> {
  const snap = await getDocs(tasksCol(familyId, childId));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ChildTask))
    .filter((t) => t.date === date);
}

/**
 * Echtzeit-Listener für Eltern-/Kind-Tab.
 *
 * Liefert alle noch offenen Aufgaben (unabhängig vom Datum, damit überfällige
 * Aufgaben sichtbar bleiben, bis ein Elternteil sie löscht oder das Kind sie
 * abhakt) plus alle für `date` (i.d.R. heute) erledigten Aufgaben. So
 * "verschwinden" Aufgaben nie einfach durch Tageswechsel (TE-117).
 */
export function subscribeToChildTasks(
  familyId: string,
  childId: string,
  date: string,
  onChange: (tasks: ChildTask[]) => void
): Unsubscribe {
  return onSnapshot(tasksCol(familyId, childId), (snap) => {
    const tasks = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as ChildTask))
      .filter((t) => !t.done || t.date === date)
      .sort((a, b) => a.date.localeCompare(b.date));
    onChange(tasks);
  });
}

// ─── Aufgaben schreiben (Eltern) ─────────────────────────────────────────────

export async function addTask(
  familyId: string,
  childId: string,
  task: Omit<ChildTask, 'id'>,
  actor: Actor = 'parent'
): Promise<string> {
  const ref = doc(tasksCol(familyId, childId));
  await setDoc(ref, task);
  await logActivity(familyId, childId, {
    action: 'created', taskId: ref.id, taskTitle: task.title, actor,
    at: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateTask(
  familyId: string,
  childId: string,
  taskId: string,
  updates: Partial<ChildTask>,
  opts?: { actor?: Actor; title?: string }
): Promise<void> {
  await updateDoc(taskDoc(familyId, childId, taskId), updates as Record<string, unknown>);
  await logActivity(familyId, childId, {
    action: 'edited', taskId,
    taskTitle: opts?.title ?? updates.title ?? '',
    actor: opts?.actor ?? 'parent',
    at: new Date().toISOString(),
  });
}

export async function deleteTask(
  familyId: string,
  childId: string,
  taskId: string,
  opts?: { actor?: Actor; title?: string }
): Promise<void> {
  await deleteDoc(taskDoc(familyId, childId, taskId));
  await logActivity(familyId, childId, {
    action: 'deleted', taskId,
    taskTitle: opts?.title ?? '',
    actor: opts?.actor ?? 'parent',
    at: new Date().toISOString(),
  });
}

export async function deleteCompletedTasks(
  familyId: string,
  childId: string,
  tasks: ChildTask[]
): Promise<void> {
  const completed = tasks.filter((t) => t.done);
  await Promise.all(
    completed.map((t) => deleteTask(familyId, childId, t.id, { actor: 'parent', title: t.title }))
  );
}

// ─── Abhaken (Kind) ──────────────────────────────────────────────────────────

export async function toggleTask(
  familyId: string,
  childId: string,
  taskId: string,
  done: boolean,
  opts?: { actor?: Actor; title?: string }
): Promise<void> {
  await updateDoc(taskDoc(familyId, childId, taskId), {
    done,
    completedAt: done ? new Date().toISOString() : null,
    rejected: false,
  });
  await logActivity(familyId, childId, {
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
  familyId: string,
  childId: string,
  taskId: string,
  opts?: { title?: string }
): Promise<void> {
  await updateDoc(taskDoc(familyId, childId, taskId), {
    done: false, completedAt: null, rejected: true,
  });
  await logActivity(familyId, childId, {
    action: 'reopened', taskId,
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
export async function getCompletedHistory(familyId: string, childId: string): Promise<ChildTask[]> {
  const snap = await getDocs(tasksCol(familyId, childId));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ChildTask))
    .filter((t) => t.done)
    .sort((a, b) => (b.completedAt ?? b.date).localeCompare(a.completedAt ?? a.date));
}

// ─── Aktivitätslog lesen/schreiben (TE-97) ───────────────────────────────────

export async function logActivity(
  familyId: string,
  childId: string,
  entry: Omit<ActivityEntry, 'id'>
): Promise<void> {
  try {
    const ref = doc(activityCol(familyId, childId));
    await setDoc(ref, entry);
  } catch (e) {
    console.warn('logActivity fehlgeschlagen', e);
  }
}

export async function getActivityLog(familyId: string, childId: string, max = 100): Promise<ActivityEntry[]> {
  const q = query(activityCol(familyId, childId), orderBy('at', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityEntry));
}

// ─── Push-Token ──────────────────────────────────────────────────────────────

export async function savePushToken(familyId: string, childId: string, token: string): Promise<void> {
  await setDoc(childDoc(familyId, childId), { pushToken: token }, { merge: true });
}

export async function getPushTokens(familyId: string, childIds: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const childId of childIds) {
    const snap = await getDoc(childDoc(familyId, childId));
    result[childId] = snap.exists() ? (snap.data()?.pushToken ?? null) : null;
  }
  return result;
}

// ─── Task-Belohnung freigeben (TE-61) ────────────────────────────────────────

/** Eltern geben die Belohnung einer abgehakten Aufgabe frei (oder ziehen die
 *  Freigabe zurück). Setzt nur das rewardReleased-Flag auf der jeweiligen Kopie. */
export async function releaseTaskReward(
  familyId: string,
  childId: string,
  taskId: string,
  released: boolean
): Promise<void> {
  await updateDoc(taskDoc(familyId, childId, taskId), { rewardReleased: released });
}

// ─── Web-Push-Trigger ────────────────────────────────────────────────────────

export async function writePushTrigger(familyId: string, childId: string, childName: string): Promise<void> {
  await setDoc(pushTriggerDoc(familyId, childId), {
    triggeredAt: new Date().toISOString(),
    childName,
  });
}

export async function writePushTriggerAll(familyId: string, children: Array<{ id: string; name: string }>): Promise<void> {
  await Promise.all(children.map((c) => writePushTrigger(familyId, c.id, c.name)));
}

export function subscribeToPushTrigger(familyId: string, childId: string, onTrigger: () => void): Unsubscribe {
  return onSnapshot(pushTriggerDoc(familyId, childId), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (!data?.triggeredAt) return;
    const triggered = new Date(data.triggeredAt).getTime();
    if (Date.now() - triggered > 60_000) return;
    onTrigger();
  });
}

// ─── Erinnerungszeiten ───────────────────────────────────────────────────────

export async function getReminderTimes(familyId: string): Promise<string[]> {
  const snap = await getDoc(configDoc(familyId));
  if (snap.exists()) return snap.data().times as string[];
  return ['15:00', '17:00'];
}

export async function setReminderTimes(familyId: string, times: string[]): Promise<void> {
  await setDoc(configDoc(familyId), { times });
}

// ─── Automatischer E-Mail-Versand (TE-149) ───────────────────────────────────
// Konfiguration für den täglichen Auto-Versand von „Push & Mail an alle".
// Familien-geteilt (nicht per-Gerät), global für alle Kinder. Default: aus,
// Standardzeiten 06:00 und 14:00.

export interface EmailReminderConfig {
  enabled: boolean;
  times: string[];
}

export async function getEmailReminderConfig(familyId: string): Promise<EmailReminderConfig> {
  const snap = await getDoc(emailConfigDoc(familyId));
  if (snap.exists()) {
    const d = snap.data();
    return {
      enabled: d.enabled === true,
      times: Array.isArray(d.times) ? (d.times as string[]) : ['06:00', '14:00'],
    };
  }
  return { enabled: false, times: ['06:00', '14:00'] };
}

export async function setEmailReminderConfig(familyId: string, config: EmailReminderConfig): Promise<void> {
  await setDoc(emailConfigDoc(familyId), config);
}
