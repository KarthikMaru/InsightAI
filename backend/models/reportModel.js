// File path: backend/models/reportModel.js
// Purpose: Data-access layer for the `reports` table.
//
// Converted from PostgreSQL: `$1, $2...` -> `?`; no RETURNING, so create()
// does an insert + findById.

const { query } = require('../config/db');

const reportModel = {
  async create({ userId, datasetId, reportType, filePath }) {
    const { insertId } = await query(
      `INSERT INTO reports (user_id, dataset_id, report_type, file_path) VALUES (?, ?, ?, ?)`,
      [userId, datasetId, reportType, filePath]
    );
    return reportModel.findById(insertId);
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT id, user_id, dataset_id, report_type, file_path, created_at FROM reports WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async listByUser(userId) {
    const { rows } = await query(
      `SELECT r.id, r.dataset_id, r.report_type, r.file_path, r.created_at, d.name AS dataset_name
       FROM reports r
       JOIN datasets d ON d.id = r.dataset_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async delete(id) {
    await query('DELETE FROM reports WHERE id = ?', [id]);
  },

  async countAll() {
    const { rows } = await query('SELECT COUNT(*) AS count FROM reports');
    return rows[0].count;
  },
};

module.exports = reportModel;
