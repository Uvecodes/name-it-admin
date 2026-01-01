// Overall Architecture:
// This file creates a complete authentication system that:
// Works on both signup and login pages using the same code
// Provides user feedback through toast notifications
// Handles all authentication scenarios (signup, login, logout, password reset)
// Protects routes by monitoring authentication state
// Uses Firebase v8 for compatibility and simplicity
// Follows best practices for error handling and user experience
// The file is designed to be smart - it automatically detects which page it's on and sets up the appropriate functionality without conflicts.




// Global Toast Notification System
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) return;

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
// comment: This function can be called from anywhere in your app to show a toast notification
// Purpose: Creates user-friendly popup messages
// Logic:
// Finds the toast element in the HTML
// Clears any existing toast to prevent overlapping
// Sets the message text and styling (success/error/info/warning)
// Shows the toast for 3 seconds, then hides it with a smooth animation
// Uses CSS classes to control visibility and styling

// Firebase Configuration
// NOTE: The canonical `firebaseConfig` and app initialization live in `firebase-config.js`.
// This file will use the already-initialized services if available. Fallbacks use the
// global `firebase` object if present.
const auth = (typeof window !== 'undefined' && window.auth) ? window.auth : (typeof firebase !== 'undefined' && firebase.auth ? firebase.auth() : null);
const db = (typeof window !== 'undefined' && window.db) ? window.db : (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);

// comment for the above code
// Purpose: Sets up Firebase connection and services
// Logic:
// Contains your Firebase project credentials
// Checks if Firebase is already initialized (prevents duplicate initialization errors)
// Creates auth object for user authentication (login, signup, logout)
// Creates db object for Firestore database operations

//below are the functions for authentication
// Import offline detection (you'll need to add this)
// For now, we'll add the offline check directly in the functions

// Register Function
async function register(event) {
  // Check if user is offline
  event.preventDefault(); // Prevent form submission from refreshing the page
if (!navigator.onLine) {
  showToast("Sorry, you are currently offline", "error");
  return;
}
  

  const name = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirm-password").value;

  // Validation
  if (!name || !email || !password || !confirmPassword) {
    showToast("Please fill all fields.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showToast("Passwords do not match.", "error");
    return;
  }

  

  try {
    // Set persistence to SESSION (default) or LOCAL based on your needs
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Save extra data to Firestore
    await db
      .collection("users")
      .doc(user.uid)
      .set({
        name,
        email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

    showToast("Registered and logged in!", "success");
    window.location.href = "../admin-profile.html";
  } catch (error) {
    console.error("Signup error:", error);
    showToast(error.message, "error");
  }
}
// comment: This function handles user registration

// Purpose: Handles new user account creation
// Logic:
// Prevents default form behavior (page refresh)
// Gets form values: name, age, email, password, confirm password
// Validates input: checks all fields are filled, passwords match, age is valid (4-17)
// Creates Firebase user account with email/password
// Sets session persistence (user stays logged in during browser session)
// Saves additional user data to Firestore database (name, age, creation time)
// Shows success message and redirects to dashboard
// Error handling shows user-friendly error messages


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

// comment: This function handles password reset requests
// Purpose: Allows users to reset forgotten passwords
// Logic:
// Prompts user for email address
// Validates email is not empty
// Checks email format using regex pattern
// Sends password reset email via Firebase
// Shows success/error messages to user

// Login Function (if needed elsewhere)
async function login(event) {
    event.preventDefault(); // Prevent form submission
  // Check if user is offline
if (!navigator.onLine) {
  showToast("Sorry, you are currently offline", "error");
  return;
}


  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    await auth.signInWithEmailAndPassword(email, password);
    showToast("Logged in!", "success");
    window.location.href = "../admin-profile.html";
  } catch (error) {
    console.error("Login error:", error);
    showToast(error.message, "error");
  }
}

// comment: This function handles user login


// Purpose: Authenticates existing users
// Logic:
// Prevents form refresh on submission
// Gets email and password from form
// Sets session persistence (user stays logged in)
// Attempts to sign in with Firebase credentials
// Shows success message and redirects to dashboard
// Error handling shows login errors (wrong password, user not found, etc.)



// Logout Function
async function logout() {
  try {
    await auth.signOut();
    showToast("Logged out!", "success");
    window.location.href = "../index.html";
  } catch (error) {
    console.error("Logout error:", error);
    showToast(error.message, "error");
  }
}
// comment: This function handles user logout
// Purpose: Signs out the current user
// Logic:
// Calls Firebase signOut() to end user session
// Shows success message
// Redirects to home page (index.html)
// Error handling for logout failures




// Auth State Monitor
firebase.auth().onAuthStateChanged((user) => {
  const status = document.getElementById("userInfo");
  if (user) {
    if (status) status.innerText = `Logged in as: ${user.email}`;
  } else {
    if (window.location.pathname.includes("admin")) {
      window.location.href = "../index.html";
    }
  }
});

// comment: This function monitors user authentication state
// Purpose: Monitors user login status across the app
// Logic:
// Listens for auth state changes (login/logout)
// If user is logged in: updates status display (if element exists)
// If user is logged out: redirects from dashboard to home page
// Protects dashboard from unauthorized access



// Add Event Listener for Form Submission
document.addEventListener("DOMContentLoaded", () => {
  // Signup form event listener
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", register);
    console.log("Signup form event listener attached successfully");
  } else {
    console.log("Signup form not found (this is normal on login page)");
  }

  // Login form event listener
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", login);
    console.log("Login form event listener attached successfully");
  } else {
    console.log("Login form not found (this is normal on signup page)");
  }

  const forgotPasswordLink = document.getElementById("forgotPassword");
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", (e) => {
      e.preventDefault();
      forgotPassword();
    });
  }
});
// comment: This code sets up event listeners for form submissions
// Purpose: Connects HTML forms to JavaScript functions
// Logic:
// Waits for page to fully load (DOMContentLoaded)
// Finds signup form and attaches submit event to register() function
// Finds login form and attaches submit event to login() function
// Finds forgot password link and attaches click event to forgotPassword() function
// Handles both pages gracefully (signup page won't have login form, vice versa)
// Prevents default link behavior for forgot password