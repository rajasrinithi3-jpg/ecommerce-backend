import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const requiredFirebaseKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const missingKeys = requiredFirebaseKeys.filter(
  (key) => !import.meta.env[key]
);

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
const isConfigured = Boolean(apiKey);

if (missingKeys.length > 0) {
  console.warn(
    `[Firebase] Missing configuration keys: ${missingKeys.join(", ")}. Authentication will be inactive until environment variables are set in .env.`
  );
}

let authInstance: Auth;

if (isConfigured) {
  const firebaseConfig = {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };
  const app: FirebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  authInstance = getAuth(app);
} else {
  // Safe unconfigured fallback: allows React components to mount cleanly
  // without throwing fatal auth/invalid-api-key at module load time.
  authInstance = {
    currentUser: null,
    onAuthStateChanged: (cb: (user: any) => void) => {
      setTimeout(() => cb(null), 0);
      return () => {};
    },
    signOut: () => Promise.resolve(),
  } as unknown as Auth;
}

export const auth = authInstance;
export const isFirebaseConfigured = isConfigured;
