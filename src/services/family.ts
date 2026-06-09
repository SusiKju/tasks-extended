/**
 * family.ts
 *
 * Alle Firestore-Operationen rund um Familien-Verwaltung.
 *
 * Firestore-Struktur:
 *   families/{familyId}/members/{uid}           → FamilyMember
 *   families/{familyId}/childrenConfig/{childId} → ChildConfig
 *   families/{familyId}/meta                    → FamilyMeta
 *   familyCodes/{wort-paar}                     → { familyId: string }
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  Unsubscribe,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from './firebase';

// ── Typen ────────────────────────────────────────────────────────────────────

export interface FamilyMember {
  uid: string;
  role: 'parent';
  displayName: string;
  email: string;
  joinedAt: string;
}

export interface FamilyMeta {
  familyId: string;
  code: string; // Wort-Paar, z. B. "blauer-apfel"
  createdAt: string;
  createdByUid: string;
}

export interface ChildConfig {
  id: string;
  name: string;
  /** Hex-Farbe für den Avatar-Hintergrund, z. B. "#4f86f7" */
  color: string;
  /** Optionales Emoji statt Anfangsbuchstabe, z. B. "🦁" */
  emoji?: string | null;
  createdAt: string;
}

// ── Wort-Paar-Generator ──────────────────────────────────────────────────────

const ADJEKTIVE = [
  'blauer', 'roter', 'grüner', 'gelber', 'weißer', 'schwarzer', 'bunter',
  'großer', 'kleiner', 'schneller', 'stiller', 'wilder', 'sanfter', 'kluger',
  'mutiger', 'starker', 'freier', 'heller', 'dunkler', 'warmer', 'kalter',
  'süßer', 'tapferer', 'flinker', 'froher', 'leiser', 'lauter', 'zarter',
  'fester', 'weicher', 'runder', 'langer', 'kurzer', 'hoher', 'tiefer',
];

const NOMEN = [
  'apfel', 'baum', 'wolf', 'stern', 'berg', 'see', 'wald', 'fluss',
  'vogel', 'stein', 'blatt', 'wind', 'mond', 'licht', 'weg', 'turm',
  'igel', 'fuchs', 'bär', 'adler', 'dachs', 'luchs', 'elch', 'rabe',
  'lotus', 'eiche', 'fichte', 'buche', 'birke', 'ahorn', 'linde',
  'quelle', 'gipfel', 'tal', 'insel', 'küste', 'hafen', 'brücke',
];

function generateFamilyCode(): string {
  const adj  = ADJEKTIVE[Math.floor(Math.random() * ADJEKTIVE.length)];
  const noun = NOMEN[Math.floor(Math.random() * NOMEN.length)];
  return `${adj}-${noun}`;
}

// ── Firestore-Hilfsfunktionen ────────────────────────────────────────────────

function membersCol(familyId: string) {
  return collection(db, 'families', familyId, 'members');
}

function memberDoc(familyId: string, uid: string) {
  return doc(db, 'families', familyId, 'members', uid);
}

function childrenConfigCol(familyId: string) {
  return collection(db, 'families', familyId, 'childrenConfig');
}

function metaDoc(familyId: string) {
  // Meta-Daten liegen direkt im Familie-Dokument (families/{familyId}), nicht in einem Sub-Dok
  return doc(db, 'families', familyId);
}

function familyCodeDoc(code: string) {
  return doc(db, 'familyCodes', code);
}

// ── Öffentliche API ──────────────────────────────────────────────────────────

/**
 * Legt eine neue Familie an. Erzeugt einen Wort-Paar-Code, trägt den
 * angemeldeten User als erstes Mitglied ein und speichert den Code in
 * der Lookup-Tabelle familyCodes.
 *
 * Gibt die neue familyId zurück.
 */
export async function createFamily(user: User): Promise<string> {
  const familyId = doc(collection(db, 'families')).id;
  let code = generateFamilyCode();

  // Sicherstellen, dass der Code noch frei ist (Kollision sehr unwahrscheinlich)
  let attempt = 0;
  while (attempt < 10) {
    const existing = await getDoc(familyCodeDoc(code));
    if (!existing.exists()) break;
    code = generateFamilyCode();
    attempt++;
  }

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  // Meta
  batch.set(metaDoc(familyId), {
    familyId,
    code,
    createdAt: now,
    createdByUid: user.uid,
  } satisfies FamilyMeta);

  // Erstes Mitglied
  batch.set(memberDoc(familyId, user.uid), {
    uid: user.uid,
    role: 'parent',
    displayName: user.displayName ?? user.email ?? 'Elternteil',
    email: user.email ?? '',
    joinedAt: now,
  } satisfies FamilyMember);

  // Code-Lookup
  batch.set(familyCodeDoc(code), { familyId });

  await batch.commit();
  return familyId;
}

/**
 * Tritt einer bestehenden Familie mit dem Wort-Paar-Code bei.
 * Gibt die familyId zurück, oder wirft einen Fehler wenn der Code unbekannt ist.
 */
export async function joinFamilyWithCode(user: User, code: string): Promise<string> {
  const normalised = code.trim().toLowerCase();
  const codeSnap = await getDoc(familyCodeDoc(normalised));
  if (!codeSnap.exists()) {
    throw new Error('Unbekannter Familiencode. Bitte prüfe die Schreibweise.');
  }
  const { familyId } = codeSnap.data() as { familyId: string };

  // Direkt setDoc – kein vorheriges getDoc nötig (vermeidet Berechtigungsfehler vor dem Beitreten)
  // Firestore-Regel: create erlaubt wenn request.auth.uid == uid (bereits Mitglied → update via Regel)
  await setDoc(memberDoc(familyId, user.uid), {
    uid: user.uid,
    role: 'parent',
    displayName: user.displayName ?? user.email ?? 'Elternteil',
    email: user.email ?? '',
    joinedAt: new Date().toISOString(),
  } satisfies FamilyMember);

  return familyId;
}

/**
 * Prüft, ob der User bereits einer Familie angehört.
 * Gibt die familyId zurück oder null.
 */
export async function findFamilyForUser(uid: string): Promise<string | null> {
  const userFamilySnap = await getDoc(doc(db, 'userFamilies', uid));
  if (userFamilySnap.exists()) {
    return (userFamilySnap.data() as { familyId: string }).familyId;
  }
  return null;
}

/**
 * Echtzeit-Listener auf userFamilies/{uid}.
 * Feuert sofort mit dem aktuellen Wert und bei jeder Änderung.
 * Gibt eine Unsubscribe-Funktion zurück.
 */
export function subscribeToUserFamily(
  uid: string,
  callback: (familyId: string | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'userFamilies', uid), (snap) => {
    if (snap.exists()) {
      callback((snap.data() as { familyId: string }).familyId ?? null);
    } else {
      callback(null);
    }
  }, () => callback(null));
}

/**
 * Speichert die familyId im User-eigenen Dokument (für schnellen Lookup beim Login).
 * Wird nach createFamily() und joinFamilyWithCode() aufgerufen.
 */
export async function saveUserFamilyLink(uid: string, familyId: string): Promise<void> {
  await setDoc(doc(db, 'userFamilies', uid), { familyId });
}

/**
 * Tritt aus der Familie aus. Entfernt das Mitglieds-Dokument und den userFamilies-Eintrag.
 * Die Familie selbst und alle Daten bleiben bestehen.
 */
export async function leaveFamily(uid: string, familyId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(memberDoc(familyId, uid));
  batch.delete(doc(db, 'userFamilies', uid));
  await batch.commit();
}

/** Lädt die FamilyMeta (inkl. Code). */
export async function getFamilyMeta(familyId: string): Promise<FamilyMeta | null> {
  const snap = await getDoc(metaDoc(familyId));
  return snap.exists() ? (snap.data() as FamilyMeta) : null;
}

/** Echtzeit-Listener auf die Mitgliederliste. */
export function subscribeToMembers(
  familyId: string,
  onChange: (members: FamilyMember[]) => void
): Unsubscribe {
  return onSnapshot(query(membersCol(familyId)), (snap) => {
    onChange(snap.docs.map((d) => d.data() as FamilyMember));
  });
}

// ── Kinder-Konfiguration ─────────────────────────────────────────────────────

/** Legt ein neues Kind in der Familie an. Gibt die neue childId zurück. */
export async function addChild(
  familyId: string,
  name: string,
  color: string,
  emoji?: string | null
): Promise<string> {
  const ref = doc(childrenConfigCol(familyId));
  const child: ChildConfig = {
    id: ref.id,
    name: name.trim(),
    color,
    emoji: emoji ?? null,
    createdAt: new Date().toISOString(),
  };
  await setDoc(ref, child);
  return ref.id;
}

/** Aktualisiert Name, Farbe oder Emoji eines Kindes. */
export async function updateChild(
  familyId: string,
  childId: string,
  updates: Partial<Pick<ChildConfig, 'name' | 'color' | 'emoji'>>
): Promise<void> {
  const { updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(childrenConfigCol(familyId), childId), updates);
}

/** Löscht ein Kind und alle zugehörigen Tasks. */
export async function deleteChild(familyId: string, childId: string): Promise<void> {
  // Zuerst alle Tasks des Kindes löschen
  const { getDocs } = await import('firebase/firestore');
  const tasksSnap = await getDocs(
    collection(db, 'families', familyId, 'children', childId, 'tasks')
  );
  const batch = writeBatch(db);
  tasksSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(childrenConfigCol(familyId), childId));
  await batch.commit();
}

/** Echtzeit-Listener auf die Kinder-Konfiguration. */
export function subscribeToChildren(
  familyId: string,
  onChange: (children: ChildConfig[]) => void
): Unsubscribe {
  return onSnapshot(query(childrenConfigCol(familyId)), (snap) => {
    const children = snap.docs
      .map((d) => d.data() as ChildConfig)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    onChange(children);
  });
}
