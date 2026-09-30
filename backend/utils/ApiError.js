// File path: backend/utils/ApiError.js
// Purpose: Lightweight error class carrying an HTTP status code, so the
// central error handler can respond consistently.

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
