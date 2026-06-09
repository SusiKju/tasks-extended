/**
 * useFirebaseAuth.ts
 *
 * React-Hook der den Firebase-Auth-State beobachtet.
 * Gibt { user, loading } zurück.
 *
 * - loading: true solange Firebase Auth noch nicht initialisiert hat
 *   (verhindert kurzes Flackern des Login-Screens beim App-Start)
 * - user: eingeloggter Firebase-User oder null
 */

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { subscribeToAuthState } from '../services/firebaseAuth';

export interface FirebaseAuthState {
  user: User | null;
  loading: boolean;
}

export function useFirebaseAuth(): FirebaseAuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { user, loading };
}
