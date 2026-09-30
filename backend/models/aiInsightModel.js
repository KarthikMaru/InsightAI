// File path: backend/models/aiInsightModel.js
// Purpose: Data-access layer for the `ai_insights` table — cached,
// categorized automated insights per dataset (sales/customer/regional/
// product), regenerated on demand from the AI Insights page.
//
// Converted from PostgreSQL: `$1, $2...` -> `?`; the bulk INSERT no longer
// uses RETURNING. Since replaceForDataset() always DELETEs the dataset's
// existing rows first, a plain findByDataset() after the INSERT returns
// exactly (and only) the freshly inserted set — simpler and just as
// correct as reconstructing rows from a range of insertIds.

const { query } = require('../config/db');

const aiInsightModel = {
  async replaceForDataset(datasetId, insights) {
    // Regenerating insights replaces the previous set for this dataset,
    // so the page always reflects the latest data rather than accumulating
    // stale entries.
    await query('DELETE FROM ai_insights WHERE dataset_id = ?', [datasetId]);

    if (insights.length === 0) return [];

    const values = insights.map((i) => [datasetId, i.category, i.title, i.content]);
    const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
    await query(
      `INSERT INTO ai_insights (dataset_id, category, title, content) VALUES ${placeholders}`,
      values.flat()
    );

    return aiInsightModel.findByDataset(datasetId);
  },

  async findByDataset(datasetId) {
    const { rows } = await query(
      `SELECT id, dataset_id, category, title, content, created_at
       FROM ai_insights WHERE dataset_id = ? ORDER BY created_at DESC`,
      [datasetId]
    );
    return rows;
  },
};

module.exports = aiInsightModel;
