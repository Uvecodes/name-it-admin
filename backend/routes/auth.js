// Authentication Routes
const express = require('express');
const router = express.Router();
const { auth, db } = require('../config');
const { sendSuccess, sendError, asyncHandler, validateRequiredFields } = require('../utils/api-helpers');
const { verifyToken } = require('../middleware/auth');

/**
 * POST /api/auth/register
 * Register a new admin user
 */
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

  // Validate required fields
  const missing = validateRequiredFields(req.body, ['name', 'email', 'password', 'confirmPassword']);
  if (missing.length > 0) {
    return sendError(res, `Missing required fields: ${missing.join(', ')}`, 400);
  }

  // Validate password match
  if (password !== confirmPassword) {
    return sendError(res, 'Passwords do not match', 400);
  }

  // Validate password strength
  if (password.length < 6) {
    return sendError(res, 'Password must be at least 6 characters', 400);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return sendError(res, 'Invalid email format', 400);
  }

  try {
    // Use Firebase REST API to register user (same approach as login)
    const firebaseAuthUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${process.env.FIREBASE_API_KEY || 'AIzaSyBNlcypjh6hCAbn7WCVVYPhtHNjBOVm2Cg'}`;
    
    // Use built-in fetch (Node 18+) or https module
    let fetchFn;
    try {
      // Check if fetch is available (Node 18+)
      if (typeof globalThis !== 'undefined' && globalThis.fetch) {
        fetchFn = globalThis.fetch;
      } else if (typeof fetch !== 'undefined') {
        fetchFn = fetch;
      }
    } catch (e) {
      fetchFn = null;
    }

    let response = { ok: false, status: 500 };
    let data;
    
    if (fetchFn) {
      // Use fetch if available
      try {
        response = await fetchFn(firebaseAuthUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email.trim(),
            password: password,
            returnSecureToken: true,
          }),
        });
        data = await response.json();
      } catch (fetchError) {
        console.error('Fetch error:', fetchError);
        throw fetchError;
      }
    } else {
      // Use https module as fallback
      const https = require('https');
      const { URL } = require('url');
      
      data = await new Promise((resolve, reject) => {
        const url = new URL(firebaseAuthUrl);
        const postData = JSON.stringify({
          email: email.trim(),
          password: password,
          returnSecureToken: true,
        });

        const options = {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        };

        const req = https.request(options, (res) => {
          let responseData = '';
          let statusCode = res.statusCode || 500;
          
          res.on('data', (chunk) => { responseData += chunk; });
          res.on('end', () => {
            try {
              const parsedData = JSON.parse(responseData);
              // Set response object for consistency
              response = {
                ok: statusCode >= 200 && statusCode < 300,
                status: statusCode
              };
              resolve(parsedData);
            } catch (err) {
              reject(new Error(`Failed to parse response: ${err.message}`));
            }
          });
        });

        req.on('error', (error) => {
          reject(new Error(`HTTPS request failed: ${error.message}`));
        });
        
        req.write(postData);
        req.end();
      });
    }

    // Check response
    if (!response.ok || (data && data.error)) {
      console.error('Firebase Auth API registration error:', {
        status: response.status,
        responseOk: response.ok,
        data: data,
        error: data?.error
      });
      
      if (data && data.error) {
        const errorMessage = data.error.message || 'Registration failed';
        
        if (errorMessage === 'EMAIL_EXISTS') {
          return sendError(res, 'Email already registered', 409);
        } else if (errorMessage === 'INVALID_EMAIL') {
          return sendError(res, 'Invalid email address', 400);
        } else if (errorMessage === 'WEAK_PASSWORD') {
          return sendError(res, 'Password is too weak. Please use at least 6 characters.', 400);
        } else if (errorMessage.includes('API key') || errorMessage.includes('API_KEY')) {
          return sendError(res, 'Authentication service configuration error. Please check Firebase API key.', 500);
        }
        
        return sendError(res, errorMessage, 400);
      }
      
      // If no specific error but response not ok
      return sendError(res, `Registration failed with status ${response.status}`, response.status || 500);
    }
    
    // Validate that we got the required data
    if (!data || !data.localId || !data.idToken) {
      console.error('Invalid response data from Firebase:', data);
      return sendError(res, 'Invalid response from authentication service', 500);
    }

    // Create admin document in Firestore (if available)
    try {
      if (db && typeof db.collection === 'function') {
        await db.collection('admin').doc(data.localId).set({
          name: name.trim(),
          email: email.trim(),
          uid: data.localId,
          createdAt: new Date(),
          status: 'active',
        });
        console.log('Admin document created in Firestore');
      } else {
        console.warn('Firestore not available - skipping admin document creation');
      }
    } catch (firestoreError) {
      console.error('Firestore error during registration:', firestoreError);
      // Continue even if Firestore write fails - user is still created in Auth
    }

    // Return user info and tokens
    return sendSuccess(res, {
      user: {
        uid: data.localId,
        email: data.email,
        name: name.trim(),
      },
      token: data.idToken,
      refreshToken: data.refreshToken,
    }, 'Registration successful', 201);
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    // Provide more specific error messages
    let errorMessage = 'Registration failed. Please try again.';
    if (error.message.includes('fetch') || error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Cannot connect to authentication service. Please check your connection.';
    }

    return sendError(res, errorMessage, 500, error);
  }
}));

/**
 * POST /api/auth/login
 * Login and get ID token
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate required fields
  const missing = validateRequiredFields(req.body, ['email', 'password']);
  if (missing.length > 0) {
    return sendError(res, `Missing required fields: ${missing.join(', ')}`, 400);
  }

  try {
    // Use Firebase REST API to sign in
    // Firebase Admin SDK doesn't have a direct password verification method
    const firebaseAuthUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY || 'AIzaSyBNlcypjh6hCAbn7WCVVYPhtHNjBOVm2Cg'}`;
    
    // Use built-in fetch (Node 18+) or https module
    let fetchFn;
    try {
      // Check if fetch is available (Node 18+)
      if (typeof globalThis !== 'undefined' && globalThis.fetch) {
        fetchFn = globalThis.fetch;
      } else if (typeof fetch !== 'undefined') {
        fetchFn = fetch;
      }
    } catch (e) {
      fetchFn = null;
    }

    let response = { ok: false, status: 500 };
    let data;
    
    if (fetchFn) {
      // Use fetch if available
      try {
        response = await fetchFn(firebaseAuthUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email.trim(),
            password: password,
            returnSecureToken: true,
          }),
        });
        data = await response.json();
      } catch (fetchError) {
        console.error('Fetch error:', fetchError);
        throw fetchError;
      }
    } else {
      // Use https module as fallback
      const https = require('https');
      const { URL } = require('url');
      
      data = await new Promise((resolve, reject) => {
        const url = new URL(firebaseAuthUrl);
        const postData = JSON.stringify({
          email: email.trim(),
          password: password,
          returnSecureToken: true,
        });

        const options = {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        };

        const req = https.request(options, (res) => {
          let responseData = '';
          let statusCode = res.statusCode || 500;
          
          res.on('data', (chunk) => { responseData += chunk; });
          res.on('end', () => {
            try {
              const parsedData = JSON.parse(responseData);
              // Set response object for consistency
              response = {
                ok: statusCode >= 200 && statusCode < 300,
                status: statusCode
              };
              resolve(parsedData);
            } catch (err) {
              reject(new Error(`Failed to parse response: ${err.message}`));
            }
          });
        });

        req.on('error', (error) => {
          reject(new Error(`HTTPS request failed: ${error.message}`));
        });
        
        req.write(postData);
        req.end();
      });
    }

    // Check response
    if (!response.ok || (data && data.error)) {
      console.error('Firebase Auth API error:', {
        status: response.status,
        responseOk: response.ok,
        data: data,
        error: data?.error
      });
      
      if (data && data.error) {
        const errorMessage = data.error.message || 'Login failed';
        
        // Handle different Firebase Auth error codes
        if (errorMessage === 'INVALID_PASSWORD' || 
            errorMessage === 'EMAIL_NOT_FOUND' || 
            errorMessage === 'INVALID_LOGIN_CREDENTIALS') {
          return sendError(res, 'Invalid email or password. Please check your credentials.', 401);
        } else if (errorMessage === 'USER_DISABLED') {
          return sendError(res, 'User account is disabled', 403);
        } else if (errorMessage.includes('API key') || errorMessage.includes('API_KEY')) {
          return sendError(res, 'Authentication service configuration error. Please check Firebase API key.', 500);
        } else if (errorMessage === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
          return sendError(res, 'Too many failed login attempts. Please try again later.', 429);
        }
        
        return sendError(res, errorMessage, 401);
      }
      
      // If no specific error but response not ok
      return sendError(res, `Login failed with status ${response.status}`, response.status || 500);
    }
    
    // Validate that we got the required data
    if (!data || !data.localId || !data.idToken) {
      console.error('Invalid response data from Firebase:', data);
      return sendError(res, 'Invalid response from authentication service', 500);
    }

    // Get admin profile from Firestore (if available)
    let adminData = null;
    try {
      if (db && typeof db.collection === 'function') {
        const adminDoc = await db.collection('admin').doc(data.localId).get();
        adminData = adminDoc.exists ? adminDoc.data() : null;
      }
    } catch (firestoreError) {
      console.warn('Firestore error during login (non-critical):', firestoreError);
      // Continue even if Firestore read fails
    }

    // Return user info and tokens
    return sendSuccess(res, {
      user: {
        uid: data.localId,
        email: data.email,
        name: adminData?.name || data.displayName || '',
      },
      token: data.idToken,
      refreshToken: data.refreshToken,
    }, 'Login successful');
  } catch (error) {
    console.error('Login error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Provide more specific error messages
    let errorMessage = 'Login failed. Please try again.';
    if (error.message.includes('fetch')) {
      errorMessage = 'Network error. Please check your connection.';
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Cannot connect to authentication service.';
    }
    
    return sendError(res, errorMessage, 500, error);
  }
}));

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', verifyToken, asyncHandler(async (req, res) => {
  try {
    // req.user is already populated by verifyToken middleware
    // Get admin profile from Firestore (if available)
    let adminData = null;
    try {
      if (db && typeof db.collection === 'function') {
        const adminDoc = await db.collection('admin').doc(req.user.uid).get();
        adminData = adminDoc.exists ? adminDoc.data() : null;
      }
    } catch (firestoreError) {
      console.warn('Firestore error during /me (non-critical):', firestoreError);
      // Continue even if Firestore read fails
    }

    return sendSuccess(res, {
      uid: req.user.uid,
      email: req.user.email,
      name: adminData?.name || '',
      emailVerified: req.user.emailVerified || false,
      avatarUrl: adminData?.avatarUrl || null,
    }, 'User retrieved successfully');
  } catch (error) {
    console.error('Get user error:', error);
    return sendError(res, 'Failed to retrieve user', 500, error);
  }
}));

/**
 * POST /api/auth/logout
 * Logout (token invalidation handled client-side)
 */
router.post('/logout', verifyToken, asyncHandler(async (req, res) => {
  // In Firebase, tokens are stateless, so logout is handled client-side
  // by removing the token. We can optionally revoke refresh tokens here.
  return sendSuccess(res, null, 'Logout successful');
}));

module.exports = router;

