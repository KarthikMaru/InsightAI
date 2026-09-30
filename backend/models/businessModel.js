// File path: backend/models/businessModel.js
// Purpose: Data-access layer for the `businesses` table. Every user gets
// exactly one business profile created automatically at registration,
// which datasets are later attached to.
//
// Converted from PostgreSQL: `$1, $2...` -> `?`; no RETURNING clause, so
// writes are followed by a plain SELECT. COALESCE works identically in
// MySQL, so the partial-update pattern in updateByUserId is unchanged.

const { query } = require('../config/db');

const businessModel = {
  async create({ userId, businessName, industry = null }) {
    await query(
      `INSERT INTO businesses (user_id, business_name, industry) VALUES (?, ?, ?)`,
      [userId, businessName, industry]
    );
    return businessModel.findByUserId(userId);
  },

  async findByUserId(userId) {
    const { rows } = await query(
      'SELECT id, user_id, business_name, industry, created_at FROM businesses WHERE user_id = ?',
      [userId]
    );
    return rows[0] || null;
  },

  async updateByUserId(userId, { businessName, industry }) {
    await query(
      `UPDATE businesses SET business_name = COALESCE(?, business_name), industry = COALESCE(?, industry)
       WHERE user_id = ?`,
      [businessName || null, industry || null, userId]
    );
    return businessModel.findByUserId(userId);
  },
};

module.exports = businessModel;
