/**
 * fuerUns.ts (TE-55)
 * "Für uns" – private tägliche Wertschätzungsnachrichten zwischen den Eltern.
 *
 * Gleiches Grundmuster wie sharedNotes.ts (geteilte Liste), aber:
 * - kein "done"-Konzept, dafür readAt fürs Unread-Tracking (Tab-Badge +
 *   Fett-Markierung in der Liste, siehe unreadFromPartner)
 * - kein Pflicht-Kategorie-Feld, nur freier Text (Inspirations-Placeholder lebt
 *   im Screen, nicht im Datenmodell)
 * - neueste zuerst statt chronologisch aufsteigend
 *
 * Firestore-Struktur:
 *   families/{familyId}/shared/fuerUns/items/{itemId} → FuerUnsItem
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { localDateStr } from '../utils/dateFormat';

export interface FuerUnsItem {
  id: string;
  text: string;
  /** Anzeigename der Person, die die Nachricht geschickt hat (frei wählbar, wie SharedNoteItem.addedBy) – nur für die Anzeige. */
  addedBy: string;
  /** Firebase-uid der Absenderin/des Absenders. Fehlt bei Nachrichten von vor TE-XX (Namenskollisionen möglich, siehe addedBy). */
  addedByUid?: string;
  createdAt: string;
  /** Optionale Icon-Kombo (aus FUER_UNS_COMBOS), beim Verfassen ausgewählt (TE-61/TE-62). */
  emoji?: string | null;
  /** Liebevolle Reaktion des Partners auf diese Nachricht. */
  reaction?: { emoji: string; by: string; byUid?: string } | null;
  /** Gesetzt, sobald der Partner die Nachricht geöffnet/gesehen hat. */
  readAt?: string | null;
  /** Soft-Delete: gesetzt wenn gelöscht, damit wiederherstellbar bleibt. */
  deletedAt?: string | null;
}

export const FUER_UNS_REACTIONS = ['❤️', '😘', '🤗', '👍'];

/**
 * Zweites, aufklappbares Reaktions-Set (TE-60): dezente, zweideutige Symbole
 * statt eindeutiger Emojis – auf den ersten Blick harmlos, für die beiden
 * Eltern aber ein klarer eigener Code. Bewusst nicht in FUER_UNS_REACTIONS
 * eingemischt, sondern separat, damit sie im UI erst nach einem "mehr"-Tap
 * erscheinen statt sofort sichtbar zu sein.
 */
export const FUER_UNS_REACTIONS_EXTRA = ['🔑', '🕯️', '🎲', '🌙', '🎀', '🔥'];

/**
 * Fertige Icon-Konstellationen fürs Verfassen (TE-62): statt einzelne Icons
 * selbst zu einer Kombination zusammenzuklicken, wählt man eine bereits
 * entworfene 2er-Kombo mit klarer Bedeutung. Jede Kombo ist als fertiger
 * String gespeichert (FuerUnsItem.emoji ist ohnehin nur ein String), keine
 * eigene Datenstruktur nötig.
 */
export const FUER_UNS_COMBOS: { emoji: string; label: string }[] = [
  // Harmlose/liebevolle Kombos zuerst – damit das Set nicht nur um Erotik geht.
  { emoji: '❤️💭', label: 'Ich denke an dich' },
  { emoji: '🤗☕', label: 'Lass uns kurz zusammen durchatmen' },
  { emoji: '🌻😊', label: 'Danke, dass es dich gibt' },
  { emoji: '🎶💫', label: 'Du gehst mir nicht aus dem Kopf' },
  { emoji: '🥰🍫', label: 'Kleine Aufmerksamkeit für dich' },
  { emoji: '🥺🫂', label: 'Nimm mich in die Arme, bitte.' },
  // Erotische Kombos
  { emoji: '🎲😈', label: 'Ich hab was Verruchtes im Kopf' },
  { emoji: '⏱️🔥', label: 'Hast du 5 heiße Minuten – nur für mich, nur jetzt?' },
  { emoji: '🍑💦', label: 'Richtig Lust auf dich' },
  { emoji: '🌙✨', label: 'Lass uns heute Nacht was Neues ausprobieren' },
];

/**
 * Antwort-Kombos: auf eine Kombo des Partners antwortet man mit einem Tipp
 * statt selbst zu formulieren. Jede Liste endet mit einem lieben Nein, damit
 * Ablehnen genauso leicht ist wie Zusagen. Antworten werden wie normale
 * Kombos als FuerUnsItem.emoji gespeichert (Text leer).
 */
const REPLY_LATER = { emoji: '🌙⏳', label: 'Heute Abend' };
const REPLY_SOFT_NO = { emoji: '💭🤍', label: 'Nicht heute – aber halt den Gedanken fest' };
const REPLY_LOVE = [
  { emoji: '🥰💭', label: 'Ich an dich auch' },
  { emoji: '🫂❤️', label: 'Fühl dich gedrückt' },
];

export const FUER_UNS_REPLIES: Record<string, { emoji: string; label: string }[]> = {
  '❤️💭': REPLY_LOVE,
  '🤗☕': [{ emoji: '☕🙋', label: 'Gern, gleich?' }, ...REPLY_LOVE],
  '🌻😊': REPLY_LOVE,
  '🎶💫': REPLY_LOVE,
  '🥰🍫': [{ emoji: '😋❤️', label: 'Danke, du Schatz' }, ...REPLY_LOVE],
  '🥺🫂': [{ emoji: '🫂🏃', label: 'Komm her, bin gleich da' }, REPLY_LOVE[1]],
  '🎲😈': [{ emoji: '👀😈', label: 'Erzähl mehr …' }, REPLY_LATER, REPLY_SOFT_NO],
  '⏱️🔥': [{ emoji: '🔥👍', label: 'Ja, jetzt' }, REPLY_LATER, REPLY_SOFT_NO],
  '🍑💦': [{ emoji: '😏🔥', label: 'Geht mir genauso' }, REPLY_LATER, REPLY_SOFT_NO],
  '🌙✨': [{ emoji: '✨🙋', label: 'Bin dabei' }, { emoji: '🤔💬', label: 'Was hast du im Kopf?' }, REPLY_SOFT_NO],
};

/** Klartext zu einer gespeicherten Kombo – egal ob Verfassen-Kombo oder Antwort-Kombo. */
export function fuerUnsComboLabel(emoji: string | null | undefined): string | undefined {
  if (!emoji) return undefined;
  return (
    FUER_UNS_COMBOS.find((c) => c.emoji === emoji) ??
    Object.values(FUER_UNS_REPLIES).flat().find((c) => c.emoji === emoji)
  )?.label;
}

/**
 * Antwortvorschläge, solange der Ball bei mir liegt: die neueste Nachricht
 * insgesamt ist vom Partner und trägt eine Kombo mit Antworten.
 */
export function pendingReplyFor(items: FuerUnsItem[], myUid: string) {
  const latest = items[0];
  if (!latest?.addedByUid || latest.addedByUid === myUid || !latest.emoji) return null;
  const replies = FUER_UNS_REPLIES[latest.emoji];
  return replies ? { item: latest, replies } : null;
}

const itemsCollection = (familyId: string) =>
  collection(db, 'families', familyId, 'shared', 'fuerUns', 'items');

/** Echtzeit-Listener – neueste zuerst (Chat-Verlauf statt Einkaufsliste). */
export function subscribeToFuerUns(
  familyId: string,
  onChange: (active: FuerUnsItem[], deleted: FuerUnsItem[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    itemsCollection(familyId),
    (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FuerUnsItem));
      const active = all
        .filter((i) => !i.deletedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const deleted = all
        .filter((i) => !!i.deletedAt)
        .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
      onChange(active, deleted);
    },
    (error) => onError?.(error)
  );
}

export async function addFuerUnsMessage(
  familyId: string,
  text: string,
  addedBy: string,
  addedByUid: string,
  emoji?: string | null
): Promise<string> {
  const ref = doc(itemsCollection(familyId));
  const item: Omit<FuerUnsItem, 'id'> = {
    text: text.trim(),
    addedBy: addedBy.trim() || 'Jemand',
    addedByUid,
    createdAt: new Date().toISOString(),
    emoji: emoji ?? null,
    reaction: null,
    readAt: null,
    deletedAt: null,
  };
  await setDoc(ref, item);
  return ref.id;
}

function itemDoc(familyId: string, itemId: string) {
  return doc(db, 'families', familyId, 'shared', 'fuerUns', 'items', itemId);
}

export async function setFuerUnsReaction(
  familyId: string,
  itemId: string,
  reaction: { emoji: string; by: string } | null
): Promise<void> {
  await updateDoc(itemDoc(familyId, itemId), { reaction });
}

export async function updateFuerUnsMessage(familyId: string, itemId: string, text: string): Promise<void> {
  await updateDoc(itemDoc(familyId, itemId), { text: text.trim() });
}

export async function deleteFuerUnsMessage(familyId: string, itemId: string): Promise<void> {
  await updateDoc(itemDoc(familyId, itemId), { deletedAt: new Date().toISOString() });
}

export async function restoreFuerUnsMessage(familyId: string, itemId: string): Promise<void> {
  await updateDoc(itemDoc(familyId, itemId), { deletedAt: null });
}

export async function permanentlyDeleteFuerUnsMessage(familyId: string, itemId: string): Promise<void> {
  await deleteDoc(itemDoc(familyId, itemId));
}

/** Toggle Lesestatus einer Nachricht (Tap auf die Zeile in FuerUnsScreen) – zweimal antippen macht es wieder ungelesen. */
export async function setFuerUnsReadState(familyId: string, itemId: string, read: boolean): Promise<void> {
  await updateDoc(itemDoc(familyId, itemId), { readAt: read ? new Date().toISOString() : null });
}

/**
 * Nachrichten vom Partner (nicht von mir selbst), die ich noch nicht gelesen habe.
 * Identität läuft über addedByUid (Firebase-uid), nicht über den frei wählbaren
 * Anzeigenamen – zwei Personen mit demselben Namen dürfen sich sonst gegenseitig
 * als "das war ich selbst" erscheinen (führte dazu, dass Partner-Nachrichten
 * weder als ungelesen zählten noch den Tab-Badge auslösten).
 */
export function unreadFromPartner(items: FuerUnsItem[], myUid: string): FuerUnsItem[] {
  return items.filter((i) => i.addedByUid !== myUid && !i.readAt);
}

/** Habe ich (lokale Zeit) heute schon selbst etwas geschickt? Steuert den Dashboard-Reminder. */
export function sentTodayByMe(items: FuerUnsItem[], myUid: string): boolean {
  const today = localDateStr(new Date().toISOString());
  return items.some((i) => i.addedByUid === myUid && localDateStr(i.createdAt) === today);
}
