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
  /** Abgehakt: verschwindet aus dem Chat in den Verlauf (TE-11), wiederherstellbar. */
  archivedAt?: string | null;
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
  // Liebevolle/alltägliche Kombos zuerst – damit das Set nicht nur um Erotik geht.
  { emoji: '🫶😌', label: 'Bin froh, dass ich dich hab' },
  { emoji: '🛋️🍷', label: 'Heute Abend Sofa, du und ich?' },
  { emoji: '👀😍', label: 'Hab grad an dich gedacht und gegrinst' },
  { emoji: '💪😘', label: 'Du rockst das heute' },
  { emoji: '🙈💛', label: 'Ich habe vorhin etwas überreagiert. Tut mir leid.' },
  // Erotische Kombos (ab FUER_UNS_FIRST_HOT – Chip-Leiste hebt sie farbig ab)
  { emoji: '😏🔥', label: 'Ich hab grad richtig Bock auf dich' },
  { emoji: '🛏️⏰', label: 'Kinder im Bett = du gehörst mir' },
  { emoji: '🌶️📸', label: 'Schick mir mal was Heißes' },
  { emoji: '😏✍️', label: 'Solltest du heute Lust haben, schreib mir doch mal, was ich mit dir machen kann.' },
];

/** Index der ersten erotischen Kombo in FUER_UNS_COMBOS. */
export const FUER_UNS_FIRST_HOT = 5;

/**
 * Antwort-Kombos: auf eine Kombo des Partners antwortet man mit einem Tipp
 * statt selbst zu formulieren. Jede Liste endet mit einem lieben Nein, damit
 * Ablehnen genauso leicht ist wie Zusagen. Antworten werden wie normale
 * Kombos als FuerUnsItem.emoji gespeichert (Text leer).
 */
const REPLY_LATER = { emoji: '🌙⏳', label: 'Heute Abend' };
const REPLY_SOFT_NO = { emoji: '💭🤍', label: 'Nicht heute – aber halt den Gedanken fest' };
const REPLY_HUG = { emoji: '🫂❤️', label: 'Fühl dich gedrückt' };

export const FUER_UNS_REPLIES: Record<string, { emoji: string; label: string }[]> = {
  '🫶😌': [{ emoji: '🥰🫶', label: 'Ich bin auch froh über dich' }, REPLY_HUG],
  '🛋️🍷': [{ emoji: '🍷🙋', label: 'Bin dabei' }, { emoji: '🛋️😴', label: 'Heute lieber früh schlafen' }],
  '👀😍': [{ emoji: '😊💭', label: 'Und ich an dich' }, REPLY_HUG],
  '💪😘': [{ emoji: '🥹💛', label: 'Danke, das tut gut' }, REPLY_HUG],
  '🙈💛': [{ emoji: '🫂💛', label: 'Schon gut, hab dich lieb' }, { emoji: '💬🕐', label: 'Lass uns später reden' }],
  '😏🔥': [{ emoji: '🔥🙋', label: 'Ich auch auf dich' }, REPLY_LATER, REPLY_SOFT_NO],
  '🛏️⏰': [{ emoji: '😈👍', label: 'Abgemacht' }, REPLY_SOFT_NO],
  '🌶️📸': [{ emoji: '📸😏', label: 'Kommt gleich …' }, REPLY_SOFT_NO],
  '😏✍️': [{ emoji: '✍️😈', label: 'Schreib ich dir gleich …' }, REPLY_LATER, REPLY_SOFT_NO],
};

/**
 * Frühere Kombos und Antworten (TE-62 bis TE-4) – nicht mehr auswählbar, aber
 * alte Nachrichten mit diesen Emojis sollen ihr Label behalten.
 */
const FUER_UNS_LEGACY_LABELS: { emoji: string; label: string }[] = [
  { emoji: '❤️💭', label: 'Ich denke an dich' },
  { emoji: '🤗☕', label: 'Lass uns kurz zusammen durchatmen' },
  { emoji: '🌻😊', label: 'Danke, dass es dich gibt' },
  { emoji: '🎶💫', label: 'Du gehst mir nicht aus dem Kopf' },
  { emoji: '🥰🍫', label: 'Kleine Aufmerksamkeit für dich' },
  { emoji: '🥺🫂', label: 'Nimm mich in die Arme, bitte.' },
  { emoji: '🎲😈', label: 'Ich hab was Verruchtes im Kopf' },
  { emoji: '⏱️🔥', label: 'Hast du 5 heiße Minuten – nur für mich, nur jetzt?' },
  { emoji: '🍑💦', label: 'Richtig Lust auf dich' },
  { emoji: '🌙✨', label: 'Lass uns heute Nacht was Neues ausprobieren' },
  { emoji: '🥰💭', label: 'Ich an dich auch' },
  { emoji: '☕🙋', label: 'Gern, gleich?' },
  { emoji: '😋❤️', label: 'Danke, du Schatz' },
  { emoji: '🫂🏃', label: 'Komm her, bin gleich da' },
  { emoji: '👀😈', label: 'Erzähl mehr …' },
  { emoji: '🔥👍', label: 'Ja, jetzt' },
  { emoji: '✨🙋', label: 'Bin dabei' },
  { emoji: '🤔💬', label: 'Was hast du im Kopf?' },
];

/** Klartext zu einer gespeicherten Kombo – egal ob Verfassen-Kombo oder Antwort-Kombo. */
export function fuerUnsComboLabel(emoji: string | null | undefined): string | undefined {
  if (!emoji) return undefined;
  return (
    FUER_UNS_COMBOS.find((c) => c.emoji === emoji) ??
    Object.values(FUER_UNS_REPLIES).flat().find((c) => c.emoji === emoji) ??
    FUER_UNS_CARE_COMBOS.find((c) => c.emoji === emoji) ??
    FUER_UNS_LEGACY_LABELS.find((c) => c.emoji === emoji)
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
  onChange: (active: FuerUnsItem[], deleted: FuerUnsItem[], archived: FuerUnsItem[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    itemsCollection(familyId),
    (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FuerUnsItem));
      const active = all
        .filter((i) => !i.deletedAt && !i.archivedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const deleted = all
        .filter((i) => !!i.deletedAt)
        .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
      const archived = all
        .filter((i) => !i.deletedAt && !!i.archivedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onChange(active, deleted, archived);
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
    archivedAt: null,
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
  reaction: { emoji: string; by: string; byUid?: string } | null
): Promise<void> {
  await updateDoc(itemDoc(familyId, itemId), { reaction });
}

export async function updateFuerUnsMessage(familyId: string, itemId: string, text: string): Promise<void> {
  await updateDoc(itemDoc(familyId, itemId), { text: text.trim() });
}

export async function deleteFuerUnsMessage(familyId: string, itemId: string): Promise<void> {
  await updateDoc(itemDoc(familyId, itemId), { deletedAt: new Date().toISOString() });
}

/** Abhaken → Verlauf. Eine abgehakte Partner-Nachricht gilt damit auch als gelesen. */
export async function setFuerUnsArchived(familyId: string, item: FuerUnsItem, archived: boolean): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(itemDoc(familyId, item.id), archived
    ? { archivedAt: now, readAt: item.readAt ?? now }
    : { archivedAt: null });
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

/**
 * Kosenamen für die Anzeige beim Partner (Dashboard-Karte). Sonst Vorname.
 * ponytail: fest im Code, weil es genau ein Paar gibt – bei mehr Paaren ein
 * Feld am Familienmitglied daraus machen.
 */
const FUER_UNS_NICKNAMES: Record<string, string> = {
  rRX2Nyg07chTCMigmpy6OXliI1h1: 'Reddi',
};

/** Wer die Pause 🌸 (ihre Tage) setzen kann – nur Diana. ponytail: fest im Code wie die Kosenamen. */
export const FUER_UNS_PAUSE_UIDS = ['8FlA32K3KUVTYhCBsHWUO046eVq2'];

export function fuerUnsDisplayName(uid: string | null | undefined, displayName: string | null | undefined): string | null {
  if (uid && FUER_UNS_NICKNAMES[uid]) return FUER_UNS_NICKNAMES[uid];
  return displayName?.split(' ')[0] ?? null;
}

// ── Lust-Barometer ──────────────────────────────────────────────────────────
// Ein Tipp am Tag, pro Person ein Dokument. Gilt nur für den Tag, an dem es
// gesetzt wurde – ein „🔥 von vor drei Tagen“ soll nicht stehen bleiben.
//   families/{familyId}/shared/fuerUns/mood/{uid} → FuerUnsMood

/** Stufen von „keine Lust“ bis „heiß“ – Icon plus Wort, damit niemand raten muss. Gespeichert wird nur der Index. */
export const FUER_UNS_MOOD_LEVELS = [
  { emoji: '😴', label: 'Müde' },
  { emoji: '🤗', label: 'Kuscheln' },
  { emoji: '😊', label: 'Offen' },
  { emoji: '😏', label: 'Lust' },
  { emoji: '🔥', label: 'Heiß' },
];

export interface FuerUnsMood {
  uid: string;
  /** Index in FUER_UNS_MOOD_LEVELS – zählt nur, wenn `date` heute ist. */
  level?: number;
  /** Lokales Datum (yyyy-MM-dd), an dem der Barometer-Wert gesetzt wurde. */
  date?: string;
  updatedAt?: string;
  /** Pause 🌸 (ihre Tage): gilt bis einschließlich dieses lokalen Datums. */
  pauseUntil?: string | null;
  /** Zuletzt in der App online (TE-31) – App-Start bzw. zurück in den Vordergrund. Bewusst nicht updatedAt, sonst „NEU“. */
  lastSeenAt?: string;
}

/** Barometer-Stand von heute, sonst null. */
export function moodToday(m: FuerUnsMood | null | undefined): FuerUnsMood | null {
  return m && m.level != null && m.date === localDateStr(new Date().toISOString()) ? m : null;
}

/** Läuft gerade eine Pause? Liefert das Enddatum oder null. */
export function activePause(m: FuerUnsMood | null | undefined): string | null {
  return m?.pauseUntil && m.pauseUntil >= localDateStr(new Date().toISOString()) ? m.pauseUntil : null;
}

/** Echtzeit-Listener auf die Barometer-Dokumente beider Partner (Gültigkeit prüfen moodToday/activePause). */
export function subscribeToFuerUnsMoods(
  familyId: string,
  onChange: (moods: FuerUnsMood[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'families', familyId, 'shared', 'fuerUns', 'mood'),
    (snap) => onChange(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as FuerUnsMood))),
    (error) => onError?.(error)
  );
}

function moodDoc(familyId: string, uid: string) {
  return doc(db, 'families', familyId, 'shared', 'fuerUns', 'mood', uid);
}

export async function setFuerUnsMood(familyId: string, uid: string, level: number): Promise<void> {
  const now = new Date().toISOString();
  // merge: eine laufende Pause bleibt stehen
  await setDoc(moodDoc(familyId, uid), { level, date: localDateStr(now), updatedAt: now }, { merge: true });
}

/** TE-31: „zuletzt online“ – liegt im eigenen Barometer-Dokument, damit keine neue Rule nötig ist. */
export async function markFuerUnsSeen(familyId: string, uid: string): Promise<void> {
  await setDoc(moodDoc(familyId, uid), { lastSeenAt: new Date().toISOString() }, { merge: true });
}

/**
 * Nur diese Person sieht auf dem Dashboard, wann der Partner zuletzt online war (TE-31).
 * ponytail: fest im Code wie FUER_UNS_NICKNAMES – bei Bedarf eine Einstellung daraus machen.
 */
export const FUER_UNS_LAST_SEEN_VIEWER = 'rRX2Nyg07chTCMigmpy6OXliI1h1';

/** Pause für `days` Tage ab heute (heute zählt mit), oder `null` zum Beenden. */
export async function setFuerUnsPause(familyId: string, uid: string, days: number | null): Promise<void> {
  let pauseUntil: string | null = null;
  if (days) {
    const end = new Date();
    end.setDate(end.getDate() + days - 1);
    pauseUntil = localDateStr(end.toISOString());
  }
  await setDoc(moodDoc(familyId, uid), { pauseUntil }, { merge: true });
}

/** Fürsorge-Kombos, die der Partner während einer Pause angeboten bekommt. */
export const FUER_UNS_CARE_COMBOS = [
  { emoji: '🫖💛', label: 'Tee?' },
  { emoji: '🍫🚚', label: 'Schoki kommt' },
  { emoji: '🫂🛋️', label: 'Einfach kuscheln' },
  { emoji: '♨️🤍', label: 'Wärmflasche?' },
];
