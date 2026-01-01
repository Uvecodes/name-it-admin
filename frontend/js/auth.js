// Overall Architecture:
// This file creates a complete authentication system that:
// Works on both signup and login pages using the same code
// Provides user feedback through toast notifications
// Handles all authentication scenarios (signup, login, logout, password reset)
// Protects routes by monitoring authentication state
// Uses backend API for authentication (migrated from Firebase client SDK)
// Follows best practices for error handling and user experience
// The file is designed to be smart - it automatically detects which page it's on and sets up the appropriate functionality without conflicts.

// console.log() redec;laration to avoid errors in some environments
console.log = function() {};
console.warn = function() {};
console.error = function() {};
console.info = function() {};

// Toast notification system is loaded from js/toast.js
// showToast function is available via window.showToast

// API Client
// NOTE: The API client is initialized in `api-client.js` and exposed as `window.api`
// This file uses the API client for all authentication operations
// The API client handles token management and request formatting

//below are the functions for authentication
// Import offline detection (you'll need to add this)
// For now, we'll add the offline check directly in the functions

// Register Function
async function register(event) {
  // Check if user is offline
  event.preventDefault(); // Prevent form submission from refreshing the page
if (!navigator.onLine) {
  showToast("Sorry, you are currently offline");
  return;
}
  

  const nameInput = document.getElementById("fullName") || document.getElementById("name");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirm-password");

  // Defensive checks: ensure required form fields exist before reading values
  if (!nameInput || !emailInput || !passwordInput || !confirmInput) {
    console.error('Register: form inputs missing');
    showToast('Form is incomplete or missing required fields.');
    return;
  }

  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmInput.value;

  // Validation
  if (!name || !email || !password || !confirmPassword) {
    showToast("Please fill all fields.");
    return;
  }

  if (password !== confirmPassword) {
    showToast("Passwords do not match.");
    return;
  }

  

  

  try {
    // Check if API client is available
    if (typeof window === 'undefined' || !window.api) {
      showToast('API client not available. Please refresh the page.', 'error');
      return;
    }

    // Register user via API
    const response = await window.api.auth.register({
      name,
      email,
      password,
      confirmPassword,
    });

    if (response.success) {
      showToast("Registered and logged in!", "success");
      // Redirect to profile/dashboard after signup
      window.location.href = "./admin-profile.html";
    } else {
      showToast(response.message || "Registration failed", "error");
    }
  } catch (error) {
    console.error("Signup error:", error);
    // Provide user-friendly error messages
    let errorMessage = error.message || "Registration failed. Please try again.";
    
    if (errorMessage.includes('Email already')) {
      errorMessage = 'Email already registered. Please use a different email.';
    } else if (errorMessage.includes('Password')) {
      errorMessage = 'Password must be at least 6 characters.';
    } else if (errorMessage.includes('Invalid email')) {
      errorMessage = 'Please enter a valid email address.';
    } else if (errorMessage.includes('Network')) {
      errorMessage = 'Network error. Please check your internet connection.';
    }
    
    showToast(errorMessage, "error");
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
// async function forgotPassword() {
//   const email = prompt("Please enter your email address to reset your password:");

//   if (!email) {
//     showToast("Email is required");
//     return;
//   }

//   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//   if (!emailRegex.test(email)) {
//     showToast("Please enter a valid email address");
//     return;
//   }

//   try {
//     await auth.sendPasswordResetEmail(email);
//     showToast("Password reset email sent!", "success");
//   } catch (error) {
//     console.error("Password reset error:");
//     showToast("error");
//   }
// }
// fix the above forgot password function security issues later
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
  showToast("Sorry, you are currently offline");
  return;
}

  // Validate form fields exist
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  
  if (!emailInput || !passwordInput) {
    showToast('Form is incomplete or missing required fields.');
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // Validate fields are not empty
  if (!email || !password) {
    showToast("Please fill in both email and password.");
    return;
  }

  try {
    // Check if API client is available
    if (typeof window === 'undefined' || !window.api) {
      showToast('API client not available. Please refresh the page.', 'error');
      return;
    }

    // Login via API
    const response = await window.api.auth.login({
      email,
      password,
    });

    if (response.success) {
      showToast("Logged in!", "success");
      window.location.href = "./admin-profile.html";
    } else {
      // Show the actual error message from the API
      const errorMsg = response.message || "Login failed. Please check your credentials.";
      showToast(errorMsg, "error");
      console.error("Login failed:", response);
    }
  } catch (error) {
    console.error("Login error:", error);
    
    // Provide user-friendly error messages
    let errorMessage = error.message || "Login failed. Please try again.";
    
    if (errorMessage.includes('Invalid email or password') || errorMessage.includes('INVALID_PASSWORD') || errorMessage.includes('EMAIL_NOT_FOUND')) {
      errorMessage = 'Invalid email or password. Please check your credentials.';
    } else if (errorMessage.includes('USER_DISABLED')) {
      errorMessage = 'This account has been disabled.';
    } else if (errorMessage.includes('Network')) {
      errorMessage = 'Network error. Please check your internet connection.';
    } else if (errorMessage.includes('Authentication failed')) {
      errorMessage = 'Authentication failed. Please try again.';
    }
    
    showToast(errorMessage, "error");
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
    // Check if API client is available
    if (typeof window !== 'undefined' && window.api) {
      await window.api.auth.logout();
    }
    showToast("Logged out!", "success");
    window.location.href = "./index.html";
  } catch (error) {
    console.error("Logout error:", error);
    // Clear tokens locally even if API call fails
    if (typeof window !== 'undefined' && window.api) {
      window.api.token.clearTokens();
    }
    showToast("Logged out!", "success");
    window.location.href = "./index.html";
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
// Listen for auth events from API client
function setupAuthStateMonitor() {
  // Check initial auth state
  if (typeof window !== 'undefined' && window.api) {
    const isAuthenticated = window.api.auth.isAuthenticated();
    const user = window.api.auth.getCurrentUserSync();
    
    const status = document.getElementById("userInfo");
    if (user && isAuthenticated) {
      if (status) status.innerText = `Logged in as: ${user.email}`;
    } else {
      // If on admin page and not authenticated, redirect to login
      if (window.location.pathname.includes("admin") && !window.location.pathname.includes("login.html") && !window.location.pathname.includes("signup.html")) {
        window.location.href = "./login.html";
      }
    }
  }

  // Listen for auth events
  window.addEventListener('auth:login', (event) => {
    const user = event.detail;
    const status = document.getElementById("userInfo");
    if (status && user) {
      status.innerText = `Logged in as: ${user.email}`;
    }
  });

  window.addEventListener('auth:logout', () => {
    const status = document.getElementById("userInfo");
    if (status) {
      status.innerText = '';
    }
    // Redirect to login if on admin page
    if (window.location.pathname.includes("admin") && !window.location.pathname.includes("login.html") && !window.location.pathname.includes("signup.html")) {
      window.location.href = "./login.html";
    }
  });
}

// comment: This function monitors user authentication state
// Purpose: Monitors user login status across the app
// Logic:
// Checks initial auth state on page load
// Listens for auth state change events (login/logout)
// If user is logged in: updates status display (if element exists)
// If user is logged out: redirects from dashboard to home page
// Protects dashboard from unauthorized access

function setupMobileMenuToggle() {
  const mobileToggle = document.querySelector(".mobile-menu-toggle");
  const sidebar = document.querySelector(".sidebar");

  if (!mobileToggle || !sidebar) {
    return;
  }

  mobileToggle.addEventListener("click", () => {
    sidebar.classList.toggle("mobile-open");
  });
}

// Add Event Listener for Form Submission
document.addEventListener("DOMContentLoaded", () => {
  setupMobileMenuToggle();
  setupAuthStateMonitor();
  
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
      // forgotPassword(); // Commented out - implement later if needed
      showToast("Password reset functionality coming soon", "info");
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