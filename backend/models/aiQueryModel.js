// File path: backend/models/aiQueryModel.js
// Purpose: Data-access layer for the `ai_queries` table — logs every
// question asked to the AI assistant or text-to-SQL feature, along with
// what SQL (if any) was generated/run and what came back.
//
// Converted from PostgreSQL: `$1, $2...` -> `?`; no RETURNING, so create()
// does an insert + findById. The `result_summary` JSON column is written
// as a JSON.stringify'd string (mysql2 does not auto-serialize JS objects
// passed as params) and comes back already parsed into a JS object when
// read, same as PostgreSQL's JSONB did.

const { query } = require('../config/db');

const aiQueryModel = {
  async create({ userId, datasetId, question, generatedSql = null, resultSummary = null, aiResponse = null }) {
    const { insertId } = await query(
      `INSERT INTO ai_queries (user_id, dataset_id, question, generated_sql, result_summary, ai_response)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, datasetId, question, generatedSql, resultSummary ? JSON.stringify(resultSummary) : null, aiResponse]
    );
    const { rows } = await query(
      `SELECT id, user_id, dataset_id, question, generated_sql, result_summary, ai_response, created_at
       FROM ai_queries WHERE id = ?`,
      [insertId]
    );
    return rows[0];
  },

  async listByDataset(datasetId, { limit = 20 } = {}) {
    const { rows } = await query(
      `SELECT id, user_id, dataset_id, question, generated_sql, result_summary, ai_response, created_at
       FROM ai_queries WHERE dataset_id = ?
       ORDER BY created_at DESC LIMIT ?`,
      [datasetId, limit]
    );
    return rows;
  },

  async countAll() {
    const { rows } = await query('SELECT COUNT(*) AS count FROM ai_queries');
    return rows[0].count;
  },
};

module.exports = aiQueryModel;
