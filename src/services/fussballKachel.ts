/**
 * fussballKachel.ts
 *
 * Persistente, nicht löschbare Fußball-Kachel pro User in Firestore.
 * Pfad: families/{familyId}/fussballKachelByUser/{uid}
 *
 * Anders als die Geistesblitze ist dies genau EINE feste Kachel je User
 * (kein Hinzufügen/Löschen). Sie hält vier unabhängige Notizabschnitte
 * (2×2-Raster) – z. B. Mannschaftsaufstellung, Bambini-Liste, freie Notizen.
 * Privat (nur für den jeweiligen User).
 */

import { db } from './firebase';
import { doc, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';

export interface FussballAbschnitt {
  /** Frei benennbarer Titel des Notizabschnitts. */
  title: string;
  /** Freitext – unterstützt Zeilenumbrüche und Aufzählungen (z. B. "- Max"). */
  body: string;
}

export interface FussballKachelData {
  sections: FussballAbschnitt[];
}

/** Vier Default-Abschnitte – Titel sind frei überschreibbar. */
export const DEFAULT_SECTIONS: FussballAbschnitt[] = [
  { title: 'Aufstellung', body: '' },
  { title: 'Bambini', body: '' },
  { title: 'Auswechselbank', body: '' },
  { title: 'Notizen', body: '' },
];

const kachelDoc = (familyId: string, uid: string) =>
  doc(db, 'families', familyId, 'fussballKachelByUser', uid);

/** Genau vier Abschnitte garantieren – fehlende mit Defaults auffüllen. */
function normalize(sections?: FussballAbschnitt[]): FussballAbschnitt[] {
  return DEFAULT_SECTIONS.map((def, i) => ({
    title: sections?.[i]?.title ?? def.title,
    body: sections?.[i]?.body ?? def.body,
  }));
}

/**
 * Echtzeit-Listener auf die eine Kachel des Users. Liefert immer vier
 * Abschnitte – auch wenn das Dokument noch nicht existiert.
 */
export function subscribeToFussballKachel(
  familyId: string,
  uid: string,
  onChange: (data: FussballKachelData) => void,
  onError?: (e: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    kachelDoc(familyId, uid),
    (snap) => {
      const raw = snap.exists() ? (snap.data() as FussballKachelData) : undefined;
      onChange({ sections: normalize(raw?.sections) });
    },
    (e) => {
      console.warn('subscribeToFussballKachel failed', e);
      onError?.(e);
    },
  );
}

/** Abschnitte speichern (Dokument wird bei Bedarf angelegt). */
export async function saveFussballKachel(
  familyId: string,
  uid: string,
  sections: FussballAbschnitt[],
): Promise<void> {
  await setDoc(
    kachelDoc(familyId, uid),
    { sections: normalize(sections), updatedAt: new Date().toISOString() },
    { merge: true },
  );
}
