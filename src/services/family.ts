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
  role: 'parent' | 'child';
  displayName: string;
  email: string;
  joinedAt: string;
  /**
   * Beitrittscode, mit dem dieses Mitglied beigetreten ist. Wird von der
   * Firestore-Regel geprüft (Code muss wirklich zu dieser familyId gehören),
   * damit niemand ohne Code direkt einen Mitglieds-Eintrag anlegen kann.
   * Beim Familien-Gründer nicht gesetzt.
   */
  joinCode?: string;
}

export interface FamilyMeta {
  familyId: string;
  code: string; // Wort-Paar, z. B. "blauer-apfel"
  createdAt: string;
  createdByUid: string;
  /**
   * uids, die Zugriff auf "Für uns" haben (Sicherheitsaudit TE-59). Maximal
   * die zwei tatsächlichen Elternteile – NICHT identisch mit der allgemeinen
   * Mitgliederliste, denn jedes Mitglied hat sonst role:'parent' ohne echte
   * Rollen-Unterscheidung. Wird bei createFamily mit dem Gründer befüllt und
   * beim Annehmen einer Beitrittsanfrage optional um das zweite Mitglied
   * ergänzt (siehe approveJoinRequest). Firestore-Regel erlaubt Änderungen an
   * diesem Feld nur bestehenden fuerUnsUids-Mitgliedern.
   */
  fuerUnsUids?: string[];
}

export interface JoinRequest {
  uid: string;
  displayName: string;
  email: string;
  joinCode: string;
  requestedAt: string;
  approved: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
}

export interface ChildConfig {
  id: string;
  name: string;
  /** Hex-Farbe für den Avatar-Hintergrund, z. B. "#4f86f7" */
  color: string;
  /** Optionales Emoji statt Anfangsbuchstabe, z. B. "🦁" */
  emoji?: string | null;
  /** Monatliches Taschengeld in EUR (TE-52). null/undefined = nicht konfiguriert. */
  allowance?: number | null;
  /**
   * Freitext-Abschnitt "Schiedsrichter" (TE-85) für die Kind-Ansicht – Kontakt
   * SR-Obmann, Lehrgangstermine etc. null/undefined = Abschnitt ausgeblendet.
   */
  refereeInfo?: string | null;
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

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function childEmailDoc(familyId: string, email: string) {
  return doc(db, 'families', familyId, 'childEmails', normaliseEmail(email));
}

function metaDoc(familyId: string) {
  // Meta-Daten liegen direkt im Familie-Dokument (families/{familyId}), nicht in einem Sub-Dok
  return doc(db, 'families', familyId);
}

function familyCodeDoc(code: string) {
  return doc(db, 'familyCodes', code);
}

function joinRequestsCol(familyId: string) {
  return collection(db, 'families', familyId, 'joinRequests');
}

function joinRequestDoc(familyId: string, uid: string) {
  return doc(db, 'families', familyId, 'joinRequests', uid);
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
    fuerUnsUids: [user.uid],
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
 * Löst mit dem Wort-Paar-Code eine Beitrittsanfrage aus (TE-59). Legt noch
 * KEIN Mitglieds-Dokument an – das passiert erst nach Bestätigung durch ein
 * bestehendes Mitglied, siehe completeJoin(). Gibt die familyId zurück, damit
 * der Screen auf die eigene Anfrage lauschen kann (subscribeToJoinRequest).
 */
export async function requestToJoinFamily(user: User, code: string): Promise<string> {
  const normalised = code.trim().toLowerCase();
  const codeSnap = await getDoc(familyCodeDoc(normalised));
  if (!codeSnap.exists()) {
    throw new Error('Unbekannter Familiencode. Bitte prüfe die Schreibweise.');
  }
  const { familyId } = codeSnap.data() as { familyId: string };

  await setDoc(joinRequestDoc(familyId, user.uid), {
    uid: user.uid,
    displayName: user.displayName ?? user.email ?? 'Elternteil',
    email: user.email ?? '',
    joinCode: normalised,
    requestedAt: new Date().toISOString(),
    approved: false,
    approvedBy: null,
    approvedAt: null,
  } satisfies JoinRequest);

  return familyId;
}

/** Lauscht auf die eigene Beitrittsanfrage. null = abgelehnt/gelöscht oder nicht vorhanden. */
export function subscribeToJoinRequest(
  familyId: string,
  uid: string,
  callback: (request: JoinRequest | null) => void
): Unsubscribe {
  return onSnapshot(joinRequestDoc(familyId, uid), (snap) => {
    callback(snap.exists() ? (snap.data() as JoinRequest) : null);
  });
}

/** Nimmt eine eigene, noch offene Beitrittsanfrage zurück. */
export async function cancelJoinRequest(familyId: string, uid: string): Promise<void> {
  await deleteDoc(joinRequestDoc(familyId, uid));
}

/**
 * Legt das eigene Mitglieds-Dokument an, NACHDEM ein bestehendes Mitglied die
 * Anfrage bestätigt hat (approved:true). Die Firestore-Regel prüft das
 * eigenständig gegen; ein Aufruf ohne bestätigte Anfrage schlägt fehl.
 */
export async function completeJoin(user: User, familyId: string): Promise<void> {
  // Rolle wird anhand von childEmails abgeleitet, NICHT frei gewählt – die
  // Firestore-Regel validiert diesen Wert unabhängig gegen denselben Pfad,
  // ein manipulierter Client könnte sich also nicht als 'parent' eintragen.
  const isChild = user.email
    ? (await getDoc(childEmailDoc(familyId, user.email))).exists()
    : false;

  await setDoc(memberDoc(familyId, user.uid), {
    uid: user.uid,
    role: isChild ? 'child' : 'parent',
    displayName: user.displayName ?? user.email ?? 'Mitglied',
    email: user.email ?? '',
    joinedAt: new Date().toISOString(),
  } satisfies FamilyMember);
}

/** Echtzeit-Listener auf offene Beitrittsanfragen (für bestehende Mitglieder). */
export function subscribeToJoinRequests(
  familyId: string,
  onChange: (requests: JoinRequest[]) => void
): Unsubscribe {
  return onSnapshot(query(joinRequestsCol(familyId)), (snap) => {
    const pending = snap.docs
      .map((d) => d.data() as JoinRequest)
      .filter((r) => !r.approved);
    onChange(pending);
  });
}

/**
 * Bestätigt eine Beitrittsanfrage. grantFuerUnsAccess sollte vom UI nur dann
 * angeboten/vorbelegt werden, wenn die Familie aktuell weniger als zwei
 * "Für uns"-Berechtigte hat (typischer Fall: der zweite Elternteil tritt
 * bei) – für jedes weitere Mitglied ist das eine bewusste Zusatzentscheidung.
 */
export async function approveJoinRequest(
  familyId: string,
  uid: string,
  approverUid: string,
  grantFuerUnsAccess: boolean
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(joinRequestDoc(familyId, uid), {
    approved: true,
    approvedBy: approverUid,
    approvedAt: new Date().toISOString(),
  });
  if (grantFuerUnsAccess) {
    const { arrayUnion } = await import('firebase/firestore');
    batch.update(metaDoc(familyId), { fuerUnsUids: arrayUnion(uid) });
  }
  await batch.commit();
}

/** Lehnt eine Beitrittsanfrage ab (löscht sie ersatzlos). */
export async function denyJoinRequest(familyId: string, uid: string): Promise<void> {
  await deleteDoc(joinRequestDoc(familyId, uid));
}

/** Gibt/entzieht einem bestehenden Mitglied Zugriff auf "Für uns". */
export async function setFuerUnsAccess(familyId: string, targetUid: string, granted: boolean): Promise<void> {
  const { updateDoc, arrayUnion, arrayRemove } = await import('firebase/firestore');
  await updateDoc(metaDoc(familyId), {
    fuerUnsUids: granted ? arrayUnion(targetUid) : arrayRemove(targetUid),
  });
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
 * Wird nach createFamily() und completeJoin() aufgerufen.
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

/**
 * Korrigiert nachträglich die Rolle eines Mitglieds (z.B. ein Kind, das ohne
 * hinterlegte childEmails-Zuordnung als 'parent' beigetreten ist). Nur ein
 * Elternteil darf das – siehe firestore.rules members/update.
 */
export async function setMemberRole(
  familyId: string,
  targetUid: string,
  role: 'parent' | 'child'
): Promise<void> {
  const { updateDoc } = await import('firebase/firestore');
  await updateDoc(memberDoc(familyId, targetUid), { role });
}

/** Lädt das eigene Mitglieds-Dokument (u.a. für die role-Prüfung beim App-Start). */
export async function getOwnMember(familyId: string, uid: string): Promise<FamilyMember | null> {
  const snap = await getDoc(memberDoc(familyId, uid));
  return snap.exists() ? (snap.data() as FamilyMember) : null;
}

/**
 * Liefert die childId, die zu einer als Kind hinterlegten E-Mail gehört
 * (families/{familyId}/childEmails/{email}), oder null.
 */
export async function getChildIdForEmail(familyId: string, email: string): Promise<string | null> {
  const snap = await getDoc(childEmailDoc(familyId, email));
  return snap.exists() ? (snap.data() as { childId: string }).childId : null;
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
  updates: Partial<Pick<ChildConfig, 'name' | 'color' | 'emoji' | 'refereeInfo'>>
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

/**
 * Spiegelt die (schon bestehende) Benachrichtigungs-E-Mail eines Kindes
 * (settings.childEmails[childId], siehe SettingsScreen) zusätzlich nach
 * families/{familyId}/childEmails/{email} – dieselbe Adresse dient jetzt
 * auch der Rollen-Erkennung beim Beitritt (siehe completeJoin/firestore.rules
 * isRegisteredChildEmail). Ein Kind bekommt so mit EINER hinterlegten Adresse
 * sowohl Aufgaben-Mails als auch automatisch die eingeschränkte Rolle.
 */
export async function syncChildLoginEmail(
  familyId: string,
  childId: string,
  childName: string,
  oldEmail: string | null,
  newEmail: string | null
): Promise<void> {
  const normalisedOld = oldEmail?.trim() ? normaliseEmail(oldEmail) : null;
  const normalisedNew = newEmail?.trim() ? normaliseEmail(newEmail) : null;

  const batch = writeBatch(db);
  if (normalisedOld) {
    batch.delete(childEmailDoc(familyId, normalisedOld));
  }
  if (normalisedNew) {
    batch.set(childEmailDoc(familyId, normalisedNew), { childId, name: childName });
  }
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
