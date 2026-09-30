// File path: backend/middleware/auth.js
// Purpose: Protects routes by verifying the JWT sent in the Authorization
// header, and provides a role-based authorization guard.

const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const userModel = require('../models/userModel');

// Verifies the JWT and attaches the authenticated user to req.user
const protect = asyncHandler(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    throw new ApiError(401, 'Not authorized, no token provided');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new ApiError(401, 'Not authorized, token invalid or expired');
  }

  const user = await userModel.findById(decoded.id);
  if (!user) {
    throw new ApiError(401, 'Not authorized, user no longer exists');
  }

  req.user = user; // { id, name, email, role, created_at }
  next();
});

// Restricts a route to specific roles, e.g. authorize('admin')
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }
  next();
};

module.exports = { protect, authorize };
