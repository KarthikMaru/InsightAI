// File path: backend/middleware/errorHandler.js
// Purpose: Central error handler. Any thrown ApiError or unexpected error
// passed via next(err) ends up here with a consistent JSON shape.
//
// Also translates a few classes of low-level errors (Multer file-size
// limit, unexpected upload-parsing failures) into the plain, generic
// messages specified for the dataset upload flow, instead of leaking
// library-specific error text like "File too large" or a raw stack-shaped
// message to the client.

const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found - ${req.originalUrl}`));
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode && err.statusCode !== 200 ? err.statusCode : (res.statusCode !== 200 ? res.statusCode : 500);
  let message = err.message;

  // Multer's file-size guard (config/limits.js -> MAX_FILE_SIZE_BYTES).
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message = 'The dataset exceeds the maximum supported size.';
  }

  // Postgres unique violation (kept from the original PostgreSQL version
  // in case any legacy code path still surfaces this code).
  const pgUniqueViolation = err.code === '23505';
  // MySQL's equivalent unique-constraint violation code.
  const mysqlDuplicateEntry = err.code === 'ER_DUP_ENTRY';

  if (pgUniqueViolation || mysqlDuplicateEntry) {
    message = 'A record with this value already exists';
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
};

module.exports = { notFound, errorHandler };
