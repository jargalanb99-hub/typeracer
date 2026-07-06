import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCLhfBuKIeJcO8ysihnHaacams8TjHDRTE",
  authDomain: "influential-gravity-mwjkk.firebaseapp.com",
  projectId: "influential-gravity-mwjkk",
  storageBucket: "influential-gravity-mwjkk.firebasestorage.app",
  messagingSenderId: "390317823126",
  appId: "1:390317823126:web:68c3bc105f0078449d1eb7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the specific database ID from config
export const db = getFirestore(app, "ai-studio-typeracermongoli-07eee8b1-e779-4426-8336-ebf17d5ace0e");
