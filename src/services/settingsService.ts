/**
 * settingsService.ts
 *
 * App-Settings pro User in Firestore (TE-49).
 * Pfad: families/{familyId}/settingsByUser/{uid}
 *
 * Synchronisiert wird nur das Präferenz-Subset von AppSettings. Volatile
 * Auth-/Session-Felder (Google-Token, Client-ID) bleiben geräte-lokal –
 * ein Sync würde zwischen Geräten Token-Races erzeugen.
 */

import { db } from './firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { AppSettings } from '../types';

/** Felder, die NICHT nach Firestore synchronisiert werden (geräte-/sitzungsgebunden). */
export const LOCAL_ONLY_SETTING_KEYS: (keyof AppSettings)[] = [
  'googleAccessToken',
  'googleRefreshToken',
  'googleTokenExpiry',
  'googleClientId',
];

/** Entfernt Local-only- und undefined-Felder. Firebase 11 hängt bei undefined-Werten. */
function toSyncable(settings: AppSettings): Partial<AppSettings> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (LOCAL_ONLY_SETTING_KEYS.includes(k as keyof AppSettings)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as Partial<AppSettings>;
}

/**
 * Abonniert die synchronisierten Settings des Users in Echtzeit.
 * Der Callback erhält nur das Sync-Subset (ohne Local-only-Felder); existiert
 * noch kein Dokument, wird er nicht aufgerufen.
 */
export function subscribeToSettings(
  familyId: string,
  uid: string,
  callback: (settings: Partial<AppSettings>) => void,
): () => void {
  const ref = doc(db, 'families', familyId, 'settingsByUser', uid);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data();
      if (data) callback(data as Partial<AppSettings>);
    },
    () => {}, // Fehler stillschweigend ignorieren – lokale Settings bleiben gültig
  );
}

/** Schreibt das synchronisierbare Settings-Subset (merge) nach Firestore. */
export async function saveSettings(
  familyId: string,
  uid: string,
  settings: AppSettings,
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'settingsByUser', uid);
  await setDoc(ref, { ...toSyncable(settings), updatedAt: new Date().toISOString() }, { merge: true });
}
