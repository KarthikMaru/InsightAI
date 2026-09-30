// File path: backend/models/datasetModel.js
// Purpose: Data-access layer for the `datasets` table.
//
// Converted from PostgreSQL: `$1, $2...` -> `?`; RETURNING replaced with
// insertId + a follow-up SELECT (create) or a follow-up findById (updates).
// Note: `is_sample` is BOOLEAN (TINYINT(1) under the hood in MySQL) and
// mysql2 returns it as a JS number (0/1) rather than true/false — every
// call site in this app only uses it in a truthy check (`d.is_sample && ...`),
// so this difference is harmless and required no changes elsewhere.

const { query } = require('../config/db');

const datasetModel = {
  async create({ businessId, name, originalFilename, isSample = false, sourceType = 'uploaded' }) {
    const { insertId } = await query(
      `INSERT INTO datasets (business_id, name, original_filename, is_sample, source_type, status)
       VALUES (?, ?, ?, ?, ?, 'processing')`,
      [businessId, name, originalFilename, isSample, sourceType]
    );
    return datasetModel.findById(insertId);
  },

  async markReady(id, rowCount) {
    await query(`UPDATE datasets SET status = 'ready', row_count = ? WHERE id = ?`, [rowCount, id]);
    return datasetModel.findById(id);
  },

  async markFailed(id) {
    await query(`UPDATE datasets SET status = 'failed' WHERE id = ?`, [id]);
  },

  async findByBusiness(businessId) {
    const { rows } = await query(
      `SELECT id, business_id, name, original_filename, is_sample, dataset_type, file_type, source_type, row_count, status, uploaded_at, updated_at
       FROM datasets WHERE business_id = ? ORDER BY uploaded_at DESC`,
      [businessId]
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT id, business_id, name, original_filename, is_sample, dataset_type, file_type, source_type, row_count, status, uploaded_at, updated_at
       FROM datasets WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async rename(id, newName) {
    await query('UPDATE datasets SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newName, id]);
    return datasetModel.findById(id);
  },

  async delete(id) {
    await query('DELETE FROM datasets WHERE id = ?', [id]);
  },

  async countAll() {
    const { rows } = await query('SELECT COUNT(*) AS count FROM datasets');
    return rows[0].count;
  },

  async listAllForAdmin({ limit = 50, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT d.id, d.name, d.is_sample, d.row_count, d.status, d.uploaded_at,
              b.business_name, u.email AS owner_email
       FROM datasets d
       JOIN businesses b ON b.id = d.business_id
       JOIN users u ON u.id = b.user_id
       ORDER BY d.uploaded_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return rows;
  },
};

module.exports = datasetModel;
