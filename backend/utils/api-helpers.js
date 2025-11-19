// API Helper Functions
// Standardized response format and error handling

/**
 * Send success response
 */
function sendSuccess(res, data, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

/**
 * Send error response
 */
function sendError(res, message = 'An error occurred', statusCode = 500, error = null) {
  const response = {
    success: false,
    message,
  };

  // Include error details in development
  if (process.env.NODE_ENV === 'development' && error) {
    response.error = {
      message: error.message,
      stack: error.stack,
    };
  }

  return res.status(statusCode).json(response);
}

/**
 * Handle async route errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validate required fields in request body
 */
function validateRequiredFields(body, requiredFields) {
  const missing = [];
  for (const field of requiredFields) {
    if (!body[field] || (typeof body[field] === 'string' && !body[field].trim())) {
      missing.push(field);
    }
  }
  return missing;
}

module.exports = {
  sendSuccess,
  sendError,
  asyncHandler,
  validateRequiredFields,
};


