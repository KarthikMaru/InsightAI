// File path: backend/controllers/authController.js
// Purpose: Handles registration, login, and profile retrieval.
// Registration also provisions a default `business` row for the user,
// since datasets in this app always hang off a business.
//
// Converted from PostgreSQL: transactions now use config/db.js's
// getConnection() (which wraps mysql2's connection.beginTransaction()/
// commit()/rollback() rather than literal `BEGIN`/`COMMIT`/`ROLLBACK`
// query strings), `$1, $2...` -> `?`, and INSERT...RETURNING is replaced
// with insertId + a follow-up SELECT via userModel.findById().

const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const userModel = require('../models/userModel');
const businessModel = require('../models/businessModel');
const generateToken = require('../utils/generateToken');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { query, getConnection } = require('../config/db');

// @route   POST /api/auth/register
// @access  Public
const register = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ApiError(400, errors.array()[0].msg);
  }

  const { name, email, password, businessName } = req.body;

  const existingUser = await userModel.findByEmail(email);
  if (existingUser) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // Wrap user + business creation in a transaction so we never end up
  // with a user that has no business profile.
  const client = await getConnection();
  let user;
  try {
    await client.beginTransaction();

    const { insertId: userId } = await client.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'user')`,
      [name, email, passwordHash]
    );

    await client.query(
      `INSERT INTO businesses (user_id, business_name) VALUES (?, ?)`,
      [userId, businessName || `${name}'s Business`]
    );

    await client.query(
      `INSERT INTO activities (user_id, action, metadata) VALUES (?, ?, ?)`,
      [userId, 'user_registered', JSON.stringify({ email })]
    );

    await client.commit();

    const { rows: userRows } = await client.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [userId]
    );
    user = userRows[0];
  } catch (err) {
    await client.rollback();
    throw err;
  } finally {
    client.release();
  }

  const token = generateToken(user);

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    token,
    user,
  });
});

// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ApiError(400, errors.array()[0].msg);
  }

  const { email, password } = req.body;

  const user = await userModel.findByEmail(email);
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email or password');
  }

  await query(
    `INSERT INTO activities (user_id, action, metadata) VALUES (?, ?, ?)`,
    [user.id, 'user_login', JSON.stringify({ email })]
  );

  const token = generateToken(user);
  delete user.password_hash;

  res.json({
    success: true,
    message: 'Logged in successfully',
    token,
    user,
  });
});

// @route   GET /api/auth/profile
// @access  Private
const getProfile = asyncHandler(async (req, res) => {
  const business = await businessModel.findByUserId(req.user.id);
  res.json({
    success: true,
    user: req.user,
    business,
  });
});

// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { name, businessName, industry } = req.body;

  const updatedUser = name ? await userModel.updateName(req.user.id, name.trim()) : req.user;
  const updatedBusiness = await businessModel.updateByUserId(req.user.id, { businessName, industry });

  await query(
    `INSERT INTO activities (user_id, action, metadata) VALUES (?, ?, ?)`,
    [req.user.id, 'profile_updated', JSON.stringify({})]
  );

  res.json({ success: true, message: 'Profile updated', user: updatedUser, business: updatedBusiness });
});

// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Current and new password are both required');
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters long');
  }

  const record = await userModel.findByIdWithPasswordHash(req.user.id);
  const isMatch = await bcrypt.compare(currentPassword, record.password_hash);
  if (!isMatch) {
    throw new ApiError(401, 'Current password is incorrect');
  }

  const salt = await bcrypt.genSalt(10);
  const newHash = await bcrypt.hash(newPassword, salt);
  await userModel.updatePassword(req.user.id, newHash);

  await query(
    `INSERT INTO activities (user_id, action, metadata) VALUES (?, ?, ?)`,
    [req.user.id, 'password_changed', JSON.stringify({})]
  );

  res.json({ success: true, message: 'Password changed successfully' });
});

module.exports = { register, login, getProfile, updateProfile, changePassword };
