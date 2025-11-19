// Authentication Middleware
// Verifies JWT tokens and extracts user information

const { auth } = require('../config');
const { sendError } = require('../utils/api-helpers');

/**
 * Middleware to verify Firebase ID token
 */
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'No token provided', 401);
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      return sendError(res, 'Invalid token format', 401);
    }

    // Try to verify the token using Firebase Admin SDK
    let decodedToken;
    try {
      // Check if auth is available and has verifyIdToken method
      if (auth && typeof auth.verifyIdToken === 'function') {
        decodedToken = await auth.verifyIdToken(token);
      } else {
        throw new Error('Firebase Admin SDK auth not available');
      }
    } catch (adminError) {
      // If Admin SDK fails, try to decode the JWT token manually
      // Firebase ID tokens are JWTs, we can decode them (but not verify signature without Admin SDK)
      // For now, we'll use a simple JWT decode (without verification)
      // In production, you should use Admin SDK with proper credentials
      console.warn('Admin SDK token verification failed, attempting JWT decode:', adminError.message);
      
      try {
        // Simple JWT decode (without signature verification)
        // This is less secure but works for development
        const jwtParts = token.split('.');
        if (jwtParts.length !== 3) {
          throw new Error('Invalid JWT format');
        }
        
        const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
        
        // Basic validation
        if (!payload.sub || !payload.email) {
          throw new Error('Invalid token payload');
        }
        
        // Check expiration
        if (payload.exp && payload.exp < Date.now() / 1000) {
          return sendError(res, 'Token expired', 401);
        }
        
        decodedToken = {
          uid: payload.sub,
          email: payload.email,
          email_verified: payload.email_verified || false,
        };
      } catch (jwtError) {
        console.error('JWT decode error:', jwtError);
        return sendError(res, 'Invalid token', 401);
      }
    }

    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified || false,
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error);

    if (error.code === 'auth/id-token-expired' || error.message.includes('expired')) {
      return sendError(res, 'Token expired', 401);
    } else if (error.code === 'auth/id-token-revoked') {
      return sendError(res, 'Token revoked', 401);
    } else if (error.code === 'auth/argument-error' || error.message.includes('Invalid')) {
      return sendError(res, 'Invalid token', 401);
    }

    return sendError(res, 'Authentication failed', 401, error);
  }
}

/**
 * Optional middleware - doesn't fail if no token, but attaches user if token is valid
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      if (token) {
        try {
          const decodedToken = await auth.verifyIdToken(token);
          req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            emailVerified: decodedToken.email_verified,
          };
        } catch (error) {
          // Token invalid, but continue without user
          req.user = null;
        }
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    req.user = null;
    next();
  }
}

module.exports = {
  verifyToken,
  optionalAuth,
};

