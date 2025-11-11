// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBNlcypjh6hCAbn7WCVVYPhtHNjBOVm2Cg",
  authDomain: "name-it-e674c.firebaseapp.com",
  projectId: "name-it-e674c",
  storageBucket: "name-it-e674c.firebasestorage.app",
  messagingSenderId: "299394886026",
  appId: "1:299394886026:web:ca4e737e214c858ee08073",
  measurementId: "G-6DSQ7Y1F5E"
};

// Initialize Firebase (only if not already initialized)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Initialize Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Toast Notification
function showToast(message, type = "success") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  if (toast.timeoutId) {
    clearTimeout(toast.timeoutId);
  }

  toast.textContent = message;
  toast.className = `toast show ${type}`;

  toast.timeoutId = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 300);
  }, 3000);
}

// Mobile Menu Toggle
document.addEventListener("DOMContentLoaded", () => {
  const mobileToggle = document.querySelector(".mobile-menu-toggle");
  const sidebar = document.querySelector(".sidebar");
  const mainContent = document.querySelector(".main-content");
  
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener("click", () => {
      sidebar.classList.toggle("mobile-open");
    });
    
    // Close sidebar when clicking on main content
    if (mainContent) {
      mainContent.addEventListener("click", () => {
        if (sidebar.classList.contains("mobile-open")) {
          sidebar.classList.remove("mobile-open");
        }
      });
    }
  }
});

