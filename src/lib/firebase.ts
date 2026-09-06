import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase web configuration values are public identifiers, not server secrets.
// Environment overrides make the exported AI Studio app portable to another Firebase project.
const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'fabled-emissary-09v0l',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:164223903788:web:3d364a63b3409c791b8989',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAdlxzOlDbDhuTOLvLQjZ86sI8h9GseO9A',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'fabled-emissary-09v0l.firebaseapp.com',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'fabled-emissary-09v0l.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '164223903788',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(
  app,
  import.meta.env.VITE_FIREBASE_DATABASE_ID || 'ai-studio-thinktimepro-533f3657-be4e-4985-819e-a6f254e8d983',
);
