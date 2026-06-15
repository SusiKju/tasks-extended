import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, memoryLocalCache } from 'firebase/firestore';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyCj035wtqQmy602C9iQAGbg_LzxXXjx4kU",
  authDomain: "tasks-extended-34507.firebaseapp.com",
  projectId: "tasks-extended-34507",
  storageBucket: "tasks-extended-34507.firebasestorage.app",
  messagingSenderId: "425277313752",
  appId: "1:425277313752:web:d43d2f3791591896e47dad"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Web: memoryLocalCache vermeidet IndexedDB-Multi-Client-Problem bei HMR.
// Native: Standard-Verhalten (kein expliziter Cache nötig).
let _db: ReturnType<typeof getFirestore>;
if (Platform.OS === 'web') {
  try {
    _db = initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch {
    // Firestore bereits initialisiert (HMR-Reload) – bestehende Instanz verwenden.
    _db = getFirestore(app);
  }
} else {
  _db = getFirestore(app);
}
export const db = _db;

// Firebase Auth – plattformspezifische Initialisierung.
// Native braucht AsyncStorage-Persistenz, Web den Standard-Browser-Persistenz.
let _auth: import('firebase/auth').Auth | null = null;

export function getFirebaseAuth(): import('firebase/auth').Auth {
  if (_auth) return _auth;
  if (Platform.OS === 'web') {
    const { getAuth } = require('firebase/auth');
    _auth = getAuth(app);
  } else {
    const { initializeAuth, getReactNativePersistence } = require('firebase/auth');
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    try {
      _auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      // Bereits initialisiert (Hot-Reload)
      const { getAuth } = require('firebase/auth');
      _auth = getAuth(app);
    }
  }
  return _auth!;
}
