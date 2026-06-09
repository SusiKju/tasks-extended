import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
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
export const db = getFirestore(app);

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
