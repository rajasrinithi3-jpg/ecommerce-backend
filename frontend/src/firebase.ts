import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCVuSfpTDkhSgJekcI8Jt9WmGKJIWZ1P0Q",
  authDomain: "commerceiq-ai.firebaseapp.com",
  projectId: "commerceiq-ai",
  storageBucket: "commerceiq-ai.firebasestorage.app",
  messagingSenderId: "933182400368",
  appId: "1:933182400368:web:a3d1ce0fdfd808528351b5",
  measurementId: "G-2RJ8FL5N2B"

};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);