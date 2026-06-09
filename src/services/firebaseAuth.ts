/**
 * firebaseAuth.ts
 *
 * Firebase Authentication – Google Sign-In für die Familien-App.
 *
 * Web:    signInWithPopup  (Firebase-eigener Popup-Flow, kein separater GIS-Call nötig)
 * Native: signInWithCredential mit dem id_token aus dem bestehenden PKCE-Flow
 *         (googleCalendar.ts gibt idToken jetzt zurück)
 *
 * Der Firebase-Auth-User ist die Identität für das Familien-System (familyId,
 * Mitgliedschaft). Der Google-AccessToken für Kalender/Tasks/Mail bleibt
 * davon getrennt und läuft über den bestehenden googleCalendar.ts-Flow.
 */

import { Platform } from 'react-native';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

// ── Web: Firebase Popup-Flow ─────────────────────────────────────────────────

async function signInWebPopup(): Promise<User | null> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

// ── Native: id_token aus PKCE-Flow → Firebase Credential ────────────────────

async function signInNativeWithIdToken(idToken: string, accessToken: string): Promise<User | null> {
  const auth = getFirebaseAuth();
  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

// ── Öffentliche API ──────────────────────────────────────────────────────────

/**
 * Startet den Google Sign-In für Firebase Auth.
 *
 * Web:    öffnet einen Google-Popup.
 * Native: erwartet idToken + accessToken aus dem laufenden PKCE-Flow
 *         (werden von signInWithGoogle() in googleCalendar.ts geliefert).
 */
export async function signInWithFirebase(opts?: {
  idToken?: string | null;
  accessToken?: string | null;
}): Promise<User | null> {
  if (Platform.OS === 'web') {
    return signInWebPopup();
  }
  if (!opts?.idToken || !opts?.accessToken) {
    throw new Error(
      'Native Firebase-Login benötigt idToken und accessToken aus dem Google-PKCE-Flow.'
    );
  }
  return signInNativeWithIdToken(opts.idToken, opts.accessToken);
}

/** Meldet den aktuellen Firebase-User ab. */
export async function signOutFirebase(): Promise<void> {
  await firebaseSignOut(getFirebaseAuth());
}

/** Gibt den aktuell eingeloggten Firebase-User zurück (oder null). */
export function getCurrentUser(): User | null {
  return getFirebaseAuth().currentUser;
}

/**
 * React-freier Listener – gibt eine Unsubscribe-Funktion zurück.
 * Für den React-Hook siehe useFirebaseAuth.ts.
 */
export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}
