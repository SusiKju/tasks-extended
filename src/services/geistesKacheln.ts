/**
 * geistesKacheln.ts
 *
 * Persönliche Gedanken-Kacheln (Geistesblitze) pro User in Firestore.
 * Pfad: families/{familyId}/geistesKachelByUser/{uid}/tiles/{tileId}
 *
 * Privat (nur für den jeweiligen User) – nicht geteilt mit der Familie.
 */

import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';

/** Reifegrad eines Geistesblitzes. 'aufgabe' ist nur noch Ziel-Markierung: beim
 *  Umwandeln wird der Geistesblitz gelöscht (TE-16); Altbestand wird ausgeblendet. */
export type GeistesStage = 'funke' | 'gedanke' | 'plan' | 'aufgabe';
export const GEISTES_STAGES: { key: GeistesStage; label: string }[] = [
  { key: 'funke', label: 'Funke' },
  { key: 'gedanke', label: 'Gedanke' },
  { key: 'plan', label: 'Plan' },
  { key: 'aufgabe', label: 'Aufgabe' },
];

export interface GeistesKachel {
  id: string;
  text: string;
  /** Emoji (neu) oder Ionicons-Name (Altbestand, siehe isIoniconName). */
  emoji: string | null;
  color: string;
  /** Kurzes, explizit vergebenes Label für die Dashboard-Kachel (statt langem Freitext). */
  label?: string | null;
  createdAt: string;
  /** Fehlt bei Altbestand → 'funke'. */
  stage?: GeistesStage;
  /** Aus dem Text gezogene URLs – als kompakte Chips statt Langtext angezeigt. */
  links?: string[];
}

const tilesCol = (familyId: string, uid: string) =>
  collection(db, 'families', familyId, 'geistesKachelByUser', uid, 'tiles');

/**
 * Echtzeit-Listener – neueste Kacheln zuerst (clientseitig sortiert).
 */
export function subscribeToGeistesKacheln(
  familyId: string,
  uid: string,
  onChange: (tiles: GeistesKachel[]) => void,
  onError?: (e: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    tilesCol(familyId, uid),
    (snap) => {
      const tiles = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as GeistesKachel))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onChange(tiles);
    },
    (e) => {
      console.warn('subscribeToGeistesKacheln failed', e);
      onError?.(e);
    },
  );
}

export async function addGeistesKachel(
  familyId: string,
  uid: string,
  text: string,
  emoji: string | null,
  color: string,
  label?: string | null,
  links: string[] = [],
): Promise<string> {
  const ref = await addDoc(tilesCol(familyId, uid), {
    text: text.trim(),
    emoji: emoji ?? null,
    color,
    label: label ?? null,
    links,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateGeistesKachel(
  familyId: string,
  uid: string,
  id: string,
  patch: Partial<Pick<GeistesKachel, 'text' | 'emoji' | 'color' | 'label' | 'stage' | 'links'>>,
): Promise<void> {
  await updateDoc(
    doc(db, 'families', familyId, 'geistesKachelByUser', uid, 'tiles', id),
    patch,
  );
}

export async function deleteGeistesKachel(
  familyId: string,
  uid: string,
  id: string,
): Promise<void> {
  await deleteDoc(
    doc(db, 'families', familyId, 'geistesKachelByUser', uid, 'tiles', id),
  );
}
