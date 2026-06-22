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
 * Echtzeit. Existiert noch kein Dokument, wird der Callback nicht aufgerufen,
 * sodass lokale Labels nicht von einem leeren Remote-Stand überschrieben werden.
 */
export function subscribeToImportantTasks(
  familyId: string,
  uid: string,
  callback: (ids: string[]) => void,
): () => void {
  const ref = doc(db, 'families', familyId, 'importantTasksByUser', uid);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data();
      if (data && Array.isArray(data.importantTaskIds)) {
        callback(data.importantTaskIds as string[]);
      }
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
