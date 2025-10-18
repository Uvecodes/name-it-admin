// Firebase Configuration
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

// Your Firebase configuration object
const firebaseConfig = {
  apiKey: "AIzaSyBNlcypjh6hCAbn7WCVVYPhtHNjBOVm2Cg",
  authDomain: "name-it-e674c.firebaseapp.com",
  projectId: "name-it-e674c",
  storageBucket: "name-it-e674c.firebasestorage.app",
  messagingSenderId: "299394886026",
  appId: "1:299394886026:web:ca4e737e214c858ee08073",
  measurementId: "G-6DSQ7Y1F5E"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const analytics = getAnalytics(app);

export default app; 