import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

function envOrDefault(value: string | undefined, fallback: string): string {
  const candidate = value?.trim();
  return candidate && !/^(your-|placeholder|g-x+)/i.test(candidate)
    ? candidate
    : fallback;
}

const firebaseConfig = {
  apiKey: envOrDefault(import.meta.env.VITE_FIREBASE_API_KEY, "AIzaSyCVuSfpTDkhSgJekcI8Jt9WmGKJIWZ1P0Q"),
  authDomain: envOrDefault(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, "commerceiq-ai.firebaseapp.com"),
  projectId: envOrDefault(import.meta.env.VITE_FIREBASE_PROJECT_ID, "commerceiq-ai"),
  storageBucket: envOrDefault(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, "commerceiq-ai.firebasestorage.app"),
  messagingSenderId: envOrDefault(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, "933182400368"),
  appId: envOrDefault(import.meta.env.VITE_FIREBASE_APP_ID, "1:933182400368:web:a3d1ce0fdfd808528351b5"),
  measurementId: envOrDefault(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, "G-2RJ8FL5N2B"),
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);