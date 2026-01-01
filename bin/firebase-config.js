// Firebase v8 Namespaced SDK - Browser Compatible
// Your web app's Firebase configuration
// console.log() redec;laration to avoid errors in some environments
console.log = function() {};
console.warn = function() {};
console.error = function() {};
console.info = function() {};
const firebaseConfig = {
  apiKey: "AIzaSyBNlcypjh6hCAbn7WCVVYPhtHNjBOVm2Cg",
  authDomain: "name-it-e674c.firebaseapp.com",
  projectId: "name-it-e674c",
  storageBucket: "name-it-e674c.firebasestorage.app",
  messagingSenderId: "299394886026",
  appId: "1:299394886026:web:ca4e737e214c858ee08073",
  measurementId: "G-6DSQ7Y1F5E",
};
// Initialize Firebase app (only if not already initialized)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
// Initialize Firebase services (attach to window to avoid duplicate-declaration errors)
// auth and db will be available as `window.auth` / `window.db` for other scripts
try {
  // auth and firestore should be available when the corresponding SDKs are loaded
  window.auth = window.auth || (typeof firebase !== 'undefined' && firebase.auth ? firebase.auth() : null);
  window.db = window.db || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
  
  // storage should be available when the storage SDK is loaded
  window.storage = window.storage || (typeof firebase !== 'undefined' && firebase.storage ? firebase.storage() : null);

  // analytics may not be loaded or available; guard the call
  if (typeof firebase !== 'undefined' && typeof firebase.analytics === 'function') {
    window.analytics = window.analytics || firebase.analytics();
  } else {
    window.analytics = null;
    console.warn('Firebase analytics is not available (analytics script not loaded or using modular SDK).');
  }

  // messaging is optional; guard the call because it may not be included
  if (typeof firebase !== 'undefined' && typeof firebase.messaging === 'function') {
    try {
      window.messaging = window.messaging || firebase.messaging();
    } catch (e) {
      window.messaging = null;
      console.warn('Firebase messaging initialization failed:', e);
    }
  } else {
    window.messaging = null;
  }
} catch (err) {
  console.warn('Error initializing Firebase services:', err);
}