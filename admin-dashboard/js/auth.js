// Firebase Authentication System
// This file handles all authentication functionality for the admin dashboard

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

const auth = firebase.auth();
const db = firebase.firestore();

// Toast Notification System
function showToast(message, type = "success") {
  // Create toast element if it doesn't exist
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  // Clear any existing timeout
  if (toast.timeoutId) {
    clearTimeout(toast.timeoutId);
  }

  // Set message and type
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  // Hide toast after 3 seconds
  toast.timeoutId = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 300);
  }, 3000);
}

// Register Function
async function register(event) {
  event.preventDefault();
  
  // Check if user is offline
  if (!navigator.onLine) {
    showToast("Sorry, you are currently offline", "error");
    return;
  }

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirm-password").value;

  // Validation
  if (!email || !password || !confirmPassword) {
    showToast("Please fill all fields.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showToast("Passwords do not match.", "error");
    return;
  }

  if (password.length < 6) {
    showToast("Password must be at least 6 characters long.", "error");
    return;
  }

  try {
    // Set persistence to SESSION
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Save admin data to Firestore
    await db
      .collection("admins")
      .doc(user.uid)
      .set({
        email,
        role: "admin",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

    showToast("Account created successfully!", "success");
    // Redirect to admin profile after successful signup
    setTimeout(() => {
      window.location.href = "admin-profile.html";
    }, 1500);
  } catch (error) {
    console.error("Signup error:", error);
    showToast(error.message, "error");
  }
}

// Login Function
async function login(event) {
  event.preventDefault();
  
  // Check if user is offline
  if (!navigator.onLine) {
    showToast("Sorry, you are currently offline", "error");
    return;
  }

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    showToast("Please fill all fields.", "error");
    return;
  }

  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    await auth.signInWithEmailAndPassword(email, password);
    showToast("Logged in successfully!", "success");
    // Redirect to admin profile after successful login
    setTimeout(() => {
      window.location.href = "admin-profile.html";
    }, 1500);
  } catch (error) {
    console.error("Login error:", error);
    showToast(error.message, "error");
  }
}

// Logout Function
async function logout() {
  try {
    await auth.signOut();
    showToast("Logged out successfully!", "success");
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    showToast(error.message, "error");
  }
}

// Forgot Password Function
async function forgotPassword() {
  const email = prompt("Please enter your email address to reset your password:");

  if (!email) {
    showToast("Email is required", "error");
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast("Please enter a valid email address", "error");
    return;
  }

  try {
    await auth.sendPasswordResetEmail(email);
    showToast("Password reset email sent!", "success");
  } catch (error) {
    console.error("Password reset error:", error);
    showToast(error.message, "error");
  }
}

// Auth State Monitor
// firebase.auth().onAuthStateChanged((user) => {
//   if (user) {
    // User is signed in
    // console.log("User is signed in:", user.email);
    
    // If on login/signup page, redirect to admin profile
  //   if (window.location.pathname.includes("login.html") || 
  //       window.location.pathname.includes("signup.html")) {
  //     window.location.href = "admin-profile.html";
  //   }
  // } else {
    // User is signed out
    // console.log("User is signed out");
    
    // If on protected pages, redirect to login
//     if (window.location.pathname.includes("add-products.html") ||
//         window.location.pathname.includes("manage-products.html") ||
//         window.location.pathname.includes("admin-order.html") ||
//         window.location.pathname.includes("admin-profile.html")) {
//       window.location.href = "index.html";
//     }
//   }
// });



// Auth State Monitor
firebase.auth().onAuthStateChanged((user) => {
  const status = document.getElementById("userInfo");
  if (user) {
    if (status) status.innerText = `Logged in as: ${user.email}`;
  } else {
    if (window.location.pathname.includes("dashboard")) {
      window.location.href = "../index.html";
    }
  }
});


// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  // Signup form event listener
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", register);
    console.log("Signup form event listener attached");
  }

  // Login form event listener
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", login);
    console.log("Login form event listener attached");
  }

  // Forgot password link
  const forgotPasswordLink = document.getElementById("forgotPassword");
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", (e) => {
      e.preventDefault();
      forgotPassword();
    });
  }

  // Logout buttons
  const logoutButtons = document.querySelectorAll(".logout-btn");
  logoutButtons.forEach(button => {
    button.addEventListener("click", logout);
  });
});
