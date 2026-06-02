import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// ⚠️  DIESE WERTE aus der Firebase Console eintragen:
// https://console.firebase.google.com → Projekteinstellungen → Deine Apps → Web-App
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
