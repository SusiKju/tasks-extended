/**
 * childDevice.ts (TE-59)
 *
 * Spiegelt den Kinder-Modus-Status serverseitig, zusätzlich zum lokalen
 * AsyncStorage-Flag `kinder_child_id`. Schließt die bekannte Lücke: Web
 * trennt localStorage (Kind-Flag) und IndexedDB (Auth-Session) in getrennte
 * Stores – wer gezielt nur localStorage löscht, behält eine gültige Session.
 * Der Root-Guard (app/_layout.tsx) gleicht lokales Flag und Server-Flag ab
 * und stellt das lokale Flag wieder her, wenn der Server "aktiv" sagt.
 *
 * Firestore-Struktur: families/{familyId}/childDeviceById/{deviceId}
 * deviceId ist KEINE uid – ein Elternteil kann mehrere Geräte haben (eigenes
 * Handy + das Kind-Tablet), beide unter demselben Account eingeloggt. Der
 * Kind-Modus ist eine Eigenschaft des Geräts, nicht des Accounts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const DEVICE_ID_KEY = 'device_id';
let cachedDeviceId: string | null = null;

/** Zufällige, dauerhafte Geräte-ID – einmal erzeugt, danach aus AsyncStorage gelesen. */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }
  const id = uuid.v4() as string;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  cachedDeviceId = id;
  return id;
}

function childDeviceDoc(familyId: string, deviceId: string) {
  return doc(db, 'families', familyId, 'childDeviceById', deviceId);
}

/** Markiert dieses Gerät serverseitig als Kind-Gerät für childId. */
export async function markChildDeviceActive(familyId: string, childId: string): Promise<void> {
  const deviceId = await getDeviceId();
  await setDoc(childDeviceDoc(familyId, deviceId), {
    active: true,
    childId,
    updatedAt: new Date().toISOString(),
  });
}

/** Hebt den Kind-Modus für dieses Gerät serverseitig auf (PIN-Ausstieg). */
export async function markChildDeviceInactive(familyId: string, deviceId?: string): Promise<void> {
  const id = deviceId ?? await getDeviceId();
  await setDoc(childDeviceDoc(familyId, id), {
    active: false,
    childId: null,
    updatedAt: new Date().toISOString(),
  });
}

export interface ChildDeviceState {
  active: boolean;
  childId: string | null;
}

/** Einmaliger Abruf des Server-Flags für dieses Gerät. null = noch nie gesetzt. */
export async function getChildDeviceState(familyId: string): Promise<ChildDeviceState | null> {
  const deviceId = await getDeviceId();
  const snap = await getDoc(childDeviceDoc(familyId, deviceId));
  return snap.exists() ? (snap.data() as ChildDeviceState) : null;
}
