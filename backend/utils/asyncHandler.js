// File path: backend/utils/asyncHandler.js
// Purpose: Wraps async Express route handlers so thrown errors are passed
// to next() automatically, instead of every controller needing try/catch.

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
