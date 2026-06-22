/**
 * importantTasksService.ts
 *
 * Das „Wichtig"-Label pro Task in Firestore (TE-123).
 * Pfad: families/{familyId}/importantTasksByUser/{uid}
 *
 * Google Tasks kennt kein „important"-Feld, deshalb geht das Label beim
 * normalen Task-Sync (über Google) verloren. Damit es geräteübergreifend
 * erhalten bleibt, wird die Menge der als wichtig markierten Tasks separat
 * in Firestore gespeichert – analog zu den Mail-Pins (TE-50).
 *
 * Als stabiler, geräteübergreifender Schlüssel dient die googleEventId des
 * Tasks (die lokale id unterscheidet sich pro Gerät). Rein lokale Tasks ohne
 * googleEventId werden hier nicht erfasst – sie existieren ohnehin nur auf
 * einem Gerät und behalten ihr lokales Label.
 */

import { db } from './firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

/**
 * Abonniert die als wichtig markierten Task-IDs (googleEventId) des Users in
 * Echtzeit. Der Callback bekommt zusätzlich `exists`:
 *  - `exists === false`: es gibt noch KEIN Dokument. Der Aufrufer darf den
 *    lokalen Stand NICHT mit einem leeren Remote-Stand überschreiben, sondern
 *    soll seinen lokalen Stand hochladen (Seeding).
 *  - `exists === true`: das Dokument existiert (ids ggf. leer) und ist die
 *    geräteübergreifende Wahrheit.
 */
export function subscribeToImportantTasks(
  familyId: string,
  uid: string,
  callback: (ids: string[], exists: boolean) => void,
): () => void {
  const ref = doc(db, 'families', familyId, 'importantTasksByUser', uid);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data();
      const ids = data && Array.isArray(data.importantTaskIds)
        ? (data.importantTaskIds as string[])
        : [];
      callback(ids, snap.exists());
    },
    () => {}, // Fehler stillschweigend ignorieren – lokale Labels bleiben gültig
  );
}

/** Schreibt die aktuelle Menge wichtiger Task-IDs (merge) nach Firestore. */
export async function saveImportantTasks(
  familyId: string,
  uid: string,
  importantTaskIds: string[],
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'importantTasksByUser', uid);
  await setDoc(ref, { importantTaskIds, updatedAt: new Date().toISOString() }, { merge: true });
}
