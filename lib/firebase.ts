import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBjpuulrhwB0grjAtPshv0l_I6owSF7Q4k",
  authDomain: "lsu-tracker.firebaseapp.com",
  projectId: "lsu-tracker",
  storageBucket: "lsu-tracker.firebasestorage.app",
  messagingSenderId: "68027606603",
  appId: "1:68027606603:web:064b8602a33d552ee08fce",
  measurementId: "G-CJT9KBT9GR",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
