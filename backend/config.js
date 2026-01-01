// Firebase Admin SDK Configuration
// This file initializes Firebase Admin SDK for server-side operations
const admin = require('firebase-admin');

// Firebase configuration (moved from client-side)
const firebaseConfig = {
  apiKey: "AIzaSyBNlcypjh6hCAbn7WCVVYPhtHNjBOVm2Cg",
  authDomain: "name-it-e674c.firebaseapp.com",
  projectId: "name-it-e674c",
  storageBucket: "name-it-e674c.firebasestorage.app",
  messagingSenderId: "299394886026",
  appId: "1:299394886026:web:ca4e737e214c858ee08073",
  measurementId: "G-6DSQ7Y1F5E",
};

// Initialize Firebase Admin SDK (only if not already initialized)
let db = null;
let auth = null;
let storage = null;

if (!admin.apps.length) {
  // For production, use service account key file
  // For now, using application default credentials or initialize with config
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
    });
    console.log('Firebase Admin SDK initialized with application default credentials');
  } catch (error) {
    console.warn('Application default credentials failed, trying without credentials:', error.message);
    try {
      // If application default credentials fail, try with project config only
      // This will work for Firestore emulator or if credentials are set via environment
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
      });
      console.log('Firebase Admin SDK initialized with project config only');
    } catch (initError) {
      console.error('Failed to initialize Firebase Admin SDK:', initError.message);
      console.warn('Firestore, Auth, and Storage operations will be disabled');
      // Don't throw - allow server to start without Firebase
    }
  }
}

// Try to initialize services, but handle errors gracefully
// Note: Firestore/Auth/Storage might be initialized but not usable without credentials
try {
  if (admin.apps.length > 0) {
    db = admin.firestore();
    auth = admin.auth();
    storage = admin.storage();
    console.log('Firebase services initialized');
  } else {
    console.warn('Firebase Admin SDK not initialized - services will be null');
    db = null;
    auth = null;
    storage = null;
  }
} catch (error) {
  console.warn('Firebase services initialization failed:', error.message);
  console.warn('The server will continue but Firestore operations will be disabled');
  // Set to null so we can check if they're available
  db = null;
  auth = null;
  storage = null;
}

module.exports = {
  admin,
  db,
  auth,
  storage,
  firebaseConfig,
};
