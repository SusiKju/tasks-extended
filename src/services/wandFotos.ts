/**
 * wandFotos.ts (TE-101)
 * Familienfotos für den Wand-Modus. Jedes Foto ist ein verkleinertes JPEG als
 * Data-URL in families/{familyId}/config/wandFoto_{id} – durch die bestehende
 * config/{docId}-Rule (isFamilyMember) abgedeckt, kein Storage und kein
 * Rules-Deploy nötig.
 *
 * ponytail: Firestore-Dokumente haben max. 1 MB, darum wird auf 1600 px
 * verkleinert (nur Web, per Canvas). Bei Bedarf an Originalgröße → Firebase Storage.
 */

import { collection, doc, documentId, onSnapshot, query, where, Unsubscribe } from 'firebase/firestore';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { setDoc, deleteDoc } from './firestoreWrites';
import { db } from './firebase';

export interface WandFoto { id: string; data: string; at: string }

const PREFIX = 'wandFoto_';
const MAX_PX = 1600;
const MAX_BYTES = 900_000;

export function subscribeWandFotos(fid: string, cb: (fotos: WandFoto[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'families', fid, 'config'),
    where(documentId(), '>=', PREFIX),
    where(documentId(), '<', `${PREFIX}`),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs
      .map((d) => ({ id: d.id.slice(PREFIX.length), ...(d.data() as { data: string; at: string }) }))
      .sort((a, b) => b.at.localeCompare(a.at))),
    () => cb([]),
  );
}

export function deleteWandFoto(fid: string, id: string): Promise<void> {
  return deleteDoc(doc(db, 'families', fid, 'config', `${PREFIX}${id}`));
}

/** Verkleinert ein Bild im Browser auf MAX_PX (lange Kante) und gibt ein JPEG als Data-URL zurück. */
function shrinkWeb(uri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const f = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * f);
      canvas.height = Math.round(img.height * f);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
    img.src = uri;
  });
}

/** Fotos aus der Galerie wählen und hochladen. Gibt die Anzahl der zu großen (übersprungenen) Bilder zurück. */
export async function pickAndUploadWandFotos(fid: string, newId: () => string): Promise<{ added: number; tooBig: number }> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    // Native kann nicht verkleinern (kein image-manipulator), nur stärker komprimieren.
    quality: Platform.OS === 'web' ? 1 : 0.4,
    base64: Platform.OS !== 'web',
  });
  if (res.canceled) return { added: 0, tooBig: 0 };
  let added = 0, tooBig = 0;
  for (const a of res.assets) {
    const data = Platform.OS === 'web' ? await shrinkWeb(a.uri) : `data:image/jpeg;base64,${a.base64}`;
    if (data.length > MAX_BYTES) { tooBig++; continue; }
    await setDoc(doc(db, 'families', fid, 'config', `${PREFIX}${newId()}`), { data, at: new Date().toISOString() });
    added++;
  }
  return { added, tooBig };
}
