// Global Error Handler Middleware

const { sendError } = require('../utils/api-helpers');

/**
 * Global error handler middleware
 * Should be added last in the middleware chain
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  // Firebase Admin errors
  if (err.code && err.code.startsWith('auth/')) {
    const errorMessages = {
      'auth/user-not-found': 'User not found',
      'auth/wrong-password': 'Invalid password',
      'auth/email-already-exists': 'Email already exists',
      'auth/invalid-email': 'Invalid email address',
      'auth/weak-password': 'Password is too weak',
      'auth/invalid-credential': 'Invalid credentials',
    };

    const message = errorMessages[err.code] || 'Authentication error';
    return sendError(res, message, 400, err);
  }

  // Firestore errors
  if (err.code && err.code.startsWith('permission-denied')) {
    return sendError(res, 'Permission denied', 403, err);
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return sendError(res, err.message, 400, err);
  }

  // Default error
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  return sendError(res, message, statusCode, err);
}

module.exports = errorHandler;


