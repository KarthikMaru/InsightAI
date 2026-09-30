// File path: backend/utils/generateToken.js
// Purpose: Sign a JWT containing the user's id and role.

const jwt = require('jsonwebtoken');

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = generateToken;
