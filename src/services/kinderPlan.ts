/**
 * kinderPlan.ts
 * Firestore-Zugriff für den Kinderplan-Tab (Strafpunkte, Wochenaufgaben,
 * Strafaufgaben). Läuft parallel zum alten Kinder-Tab.
 *
 * Bewusst unter families/{familyId}/config/* – durch die bestehende
 * config/{docId}-Rule (isFamilyMember) abgedeckt, kein Rules-Deploy nötig:
 *   config/kinderRegeln                 → KinderRegeln (die eine Stelle für alle Einstellungen)
 *   config/kinderWoche_{YYYY-MM-DD}     → KinderWoche (Strafpunkte + ✓/✗ einer Woche, Key = Montag)
 *   config/kinderStrafaufgaben          → { items: Record<id, Strafaufgabe> }
 *
 * Strafaufgaben werden zusätzlich als normale Aufgabe in der Kinder-App
 * angelegt (kinderTasks.addTask), damit das Kind sie dort sieht und abhakt.
 */

import { doc, getDoc, onSnapshot, deleteField, Unsubscribe } from 'firebase/firestore';
import { setDoc, updateDoc } from './firestoreWrites';
import { db } from './firebase';
import { addTask, toggleTask, deleteTask } from './kinderTasks';
import {
  KinderRegeln, KinderWoche, PunktEintrag, Strafaufgabe, Mark, normalisiereRegeln, isoDate,
} from '../utils/kinderPlanLogic';

const regelnDoc = (fid: string) => doc(db, 'families', fid, 'config', 'kinderRegeln');
const wocheDoc = (fid: string, wk: string) => doc(db, 'families', fid, 'config', `kinderWoche_${wk}`);
const strafDoc = (fid: string) => doc(db, 'families', fid, 'config', 'kinderStrafaufgaben');

// ── Regeln ──────────────────────────────────────────────────────────────────

export function subscribeRegeln(fid: string, cb: (r: KinderRegeln) => void): Unsubscribe {
  return onSnapshot(regelnDoc(fid), (s) => cb(normalisiereRegeln(s.data() as Partial<KinderRegeln> | undefined)));
}

export function saveRegeln(fid: string, r: KinderRegeln): Promise<void> {
  return setDoc(regelnDoc(fid), r);
}

// ── Woche: Strafpunkte & ✓/✗ ────────────────────────────────────────────────

export function subscribeWoche(fid: string, wk: string, cb: (w: KinderWoche) => void): Unsubscribe {
  return onSnapshot(wocheDoc(fid, wk), (s) => {
    const d = s.data() as Partial<KinderWoche> | undefined;
    cb({ punkte: d?.punkte ?? {}, marks: d?.marks ?? {} });
  });
}

export function addPunkt(fid: string, wk: string, id: string, e: PunktEintrag): Promise<void> {
  return setDoc(wocheDoc(fid, wk), { punkte: { [id]: e } }, { merge: true });
}

export function setPunktGrund(fid: string, wk: string, id: string, grund: string): Promise<void> {
  return setDoc(wocheDoc(fid, wk), { punkte: { [id]: { grund } } }, { merge: true });
}

export function deletePunkt(fid: string, wk: string, id: string): Promise<void> {
  return updateDoc(wocheDoc(fid, wk), { [`punkte.${id}`]: deleteField() });
}

export function setMark(fid: string, wk: string, key: string, mark: Mark): Promise<void> {
  return setDoc(wocheDoc(fid, wk), { marks: { [key]: mark } }, { merge: true });
}

// ── Strafaufgaben ───────────────────────────────────────────────────────────

export function subscribeStrafaufgaben(fid: string, cb: (items: Record<string, Strafaufgabe>) => void): Unsubscribe {
  return onSnapshot(strafDoc(fid), (s) => cb((s.data()?.items as Record<string, Strafaufgabe>) ?? {}));
}

/** Vergibt eine Strafaufgabe und legt sie als Aufgabe in der Kinder-App an. */
export async function addStrafaufgabe(
  fid: string, id: string, a: Omit<Strafaufgabe, 'taskId' | 'done' | 'doneAt' | 'at'>
): Promise<void> {
  const now = new Date();
  const taskId = await addTask(fid, a.childId, {
    title: `Strafaufgabe: ${a.label}`,
    done: false,
    date: isoDate(now),
    createdAt: now.toISOString(),
  });
  // ponytail: Strafaufgaben-Doc wächst unbegrenzt (wenige pro Woche); alte erledigte aufräumen, falls es je 1 MB erreicht
  await setDoc(strafDoc(fid), { items: { [id]: { ...a, at: now.toISOString(), done: false, doneAt: null, taskId } } }, { merge: true });
}

/** Eltern haken eine Strafaufgabe ab – auch die gespiegelte Aufgabe in der Kinder-App. */
export async function setStrafaufgabeDone(fid: string, id: string, a: Strafaufgabe, done: boolean): Promise<void> {
  await setDoc(strafDoc(fid), { items: { [id]: { done, doneAt: done ? new Date().toISOString() : null } } }, { merge: true });
  if (a.taskId) {
    await toggleTask(fid, a.childId, a.taskId, done, { actor: 'parent', title: `Strafaufgabe: ${a.label}` }).catch(() => {});
  }
}

export async function deleteStrafaufgabe(fid: string, id: string, a: Strafaufgabe): Promise<void> {
  await updateDoc(strafDoc(fid), { [`items.${id}`]: deleteField() });
  if (a.taskId) await deleteTask(fid, a.childId, a.taskId, { actor: 'parent', title: `Strafaufgabe: ${a.label}` }).catch(() => {});
}

/** Hat das Kind die Strafaufgabe in seiner App abgehakt? Dann hier als erledigt übernehmen. */
export async function syncStrafaufgaben(fid: string, items: Record<string, Strafaufgabe>): Promise<void> {
  for (const [id, a] of Object.entries(items)) {
    if (a.done || !a.taskId) continue;
    const snap = await getDoc(doc(db, 'families', fid, 'children', a.childId, 'tasks', a.taskId)).catch(() => null);
    const t = snap?.data();
    if (t?.done) {
      await setDoc(strafDoc(fid), { items: { [id]: { done: true, doneAt: t.completedAt ?? new Date().toISOString() } } }, { merge: true });
    }
  }
}
