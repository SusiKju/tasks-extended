/**
 * fussballKachel.ts
 *
 * Persistente, nicht löschbare Fokus-Kachel pro User in Firestore.
 * Pfad: focusTilesByUser/{uid}/themes/{theme}
 *
 * Strikt privat pro User – bewusst NICHT unter families/, damit die Daten
 * weder mit der Familie geteilt werden noch eine Familienmitgliedschaft
 * voraussetzen. Es gibt genau EINE Kachel je User und Thema (kein Hinzufügen/
 * Löschen). Jedes Thema (fussball/yoga/garten) hat ein eigenes Dokument mit
 * vier unabhängigen Notizabschnitten (2×2-Raster) und eigenen Default-Titeln.
 */

import { db } from './firebase';
import { doc, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { FunTileTheme } from '../types';

export interface FussballAbschnitt {
  /** Frei benennbarer Titel des Notizabschnitts. */
  title: string;
  /** Freitext – unterstützt Zeilenumbrüche und Aufzählungen (z. B. "- Max"). */
  body: string;
}

export interface FussballKachelData {
  sections: FussballAbschnitt[];
}

/** Vier Default-Abschnitte je Thema – Titel sind frei überschreibbar. */
export const DEFAULT_SECTIONS_BY_THEME: Record<FunTileTheme, FussballAbschnitt[]> = {
  fussball: [
    { title: 'akt. Abgänge Jahrg. 2019', body: '' },
    { title: 'ab 2020', body: '' },
    { title: 'Trainingsideen', body: '' },
    { title: 'Turniere', body: '' },
  ],
  yoga: [
    { title: 'Morgen-Flow', body: '' },
    { title: 'Atemübungen', body: '' },
    { title: 'Lieblings-Asanas', body: '' },
    { title: 'Ziele', body: '' },
  ],
  garten: [
    { title: 'Aussaat', body: '' },
    { title: 'Gießplan', body: '' },
    { title: 'Ernte', body: '' },
    { title: 'Besorgungen', body: '' },
  ],
};

export function defaultSections(theme: FunTileTheme): FussballAbschnitt[] {
  return (DEFAULT_SECTIONS_BY_THEME[theme] ?? DEFAULT_SECTIONS_BY_THEME.fussball).map((d) => ({ ...d }));
}

const kachelDoc = (uid: string, theme: FunTileTheme) =>
  doc(db, 'focusTilesByUser', uid, 'themes', theme);

/** Genau vier Abschnitte garantieren – fehlende mit Themen-Defaults auffüllen. */
function normalize(theme: FunTileTheme, sections?: FussballAbschnitt[]): FussballAbschnitt[] {
  return defaultSections(theme).map((def, i) => ({
    title: sections?.[i]?.title ?? def.title,
    body: sections?.[i]?.body ?? def.body,
  }));
}

/**
 * Echtzeit-Listener auf die Kachel des Users für ein Thema. Liefert immer vier
 * Abschnitte – auch wenn das Dokument noch nicht existiert.
 */
export function subscribeToFussballKachel(
  uid: string,
  theme: FunTileTheme,
  onChange: (data: FussballKachelData) => void,
  onError?: (e: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    kachelDoc(uid, theme),
    (snap) => {
      const raw = snap.exists() ? (snap.data() as FussballKachelData) : undefined;
      onChange({ sections: normalize(theme, raw?.sections) });
    },
    (e) => {
      console.warn('subscribeToFussballKachel failed', e);
      onError?.(e);
    },
  );
}

/** Abschnitte speichern (Dokument wird bei Bedarf angelegt). */
export async function saveFussballKachel(
  uid: string,
  theme: FunTileTheme,
  sections: FussballAbschnitt[],
): Promise<void> {
  await setDoc(
    kachelDoc(uid, theme),
    { sections: normalize(theme, sections), updatedAt: new Date().toISOString() },
    { merge: true },
  );
}
