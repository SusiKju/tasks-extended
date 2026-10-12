/**
 * firestoreWrites.ts (TE-75)
 *
 * Offline-taugliche Drop-ins für die Firestore-Schreibfunktionen.
 *
 * Firestore legt einen Write sofort im lokalen Cache ab (onSnapshot zeigt ihn
 * direkt an), das zurückgegebene Promise löst aber erst nach der Bestätigung
 * durch den Server auf. Offline hieße das: jedes `await setDoc(...)` hängt bis
 * zum Reconnect, Modals bleiben offen, Spinner drehen. Darum lösen diese
 * Wrapper offline sofort auf; die Synchronisierung übernimmt Firestore selbst
 * (Mutation-Queue im IndexedDB-Cache, siehe firebase.ts).
 *
 * ponytail: "offline" = navigator.onLine === false. Mit WLAN ohne echtes
 * Internet meldet der Browser online → Writes warten dann wie bisher.
 */

import {
  addDoc as fsAddDoc,
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  deleteDoc as fsDeleteDoc,
  writeBatch as fsWriteBatch,
  doc,
} from 'firebase/firestore';

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function settle<T>(p: Promise<T>, offlineValue: T): Promise<T> {
  if (!isOffline()) return p;
  p.catch((e) => console.warn('[Firestore] Offline-Write später abgelehnt:', e?.code ?? e));
  return Promise.resolve(offlineValue);
}

export const setDoc = ((...args: any[]) =>
  settle((fsSetDoc as any)(...args), undefined)) as typeof fsSetDoc;

export const updateDoc = ((...args: any[]) =>
  settle((fsUpdateDoc as any)(...args), undefined)) as typeof fsUpdateDoc;

export const deleteDoc = ((ref: any) => settle(fsDeleteDoc(ref), undefined)) as typeof fsDeleteDoc;

// addDoc = setDoc auf eine lokal erzeugte ID – so ist die Referenz auch offline sofort da.
export const addDoc = ((col: any, data: any) => {
  const ref = doc(col);
  return settle(fsSetDoc(ref, data).then(() => ref), ref);
}) as typeof fsAddDoc;

export const writeBatch = ((db: any) => {
  const batch = fsWriteBatch(db);
  const commit = batch.commit.bind(batch);
  batch.commit = () => settle(commit(), undefined);
  return batch;
}) as typeof fsWriteBatch;
