import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// === ТВОЯ КОНФІГУРАЦІЯ FIREBASE ===
const firebaseConfig = {
  apiKey: "AIzaSyDcMq-m9IzfJf3O5C3wkzgOSt4jMzPNVms",
  authDomain: "site-poster-b74ec.firebaseapp.com",
  projectId: "site-poster-b74ec",
  storageBucket: "site-poster-b74ec.firebasestorage.app",
  messagingSenderId: "1065292363345",
  appId: "1:1065292363345:web:74f83f268586c2aeffaa70",
  measurementId: "G-MQXHJB68YS"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
