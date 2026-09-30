// File path: backend/models/userModel.js
// Purpose: Data-access layer for the `users` table. Every DB interaction
// for users goes through here so controllers stay free of raw SQL.
//
// Converted from PostgreSQL: `$1, $2...` placeholders -> `?`; MySQL has no
// `RETURNING` clause, so `create()`/`updateName()` do an INSERT/UPDATE
// followed by a plain SELECT to return the same shape callers expect.

const { query } = require('../config/db');

const userModel = {
  async findByEmail(email) {
    const { rows } = await query(
      'SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = ?',
      [email]
    );
    return rows[0] || null;
  },

  async findById(id) {
    const { rows } = await query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  },

  async create({ name, email, passwordHash, role = 'user' }) {
    const { insertId } = await query(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      [name, email, passwordHash, role]
    );
    return userModel.findById(insertId);
  },

  async countAll() {
    const { rows } = await query('SELECT COUNT(*) AS count FROM users');
    return rows[0].count;
  },

  async updateName(userId, name) {
    await query(`UPDATE users SET name = ? WHERE id = ?`, [name, userId]);
    return userModel.findById(userId);
  },

  async findByIdWithPasswordHash(userId) {
    const { rows } = await query(
      'SELECT id, password_hash FROM users WHERE id = ?',
      [userId]
    );
    return rows[0] || null;
  },

  async updatePassword(userId, passwordHash) {
    await query(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, userId]);
  },

  async listAll({ limit = 50, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT id, name, email, role, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return rows;
  },
};

module.exports = userModel;
