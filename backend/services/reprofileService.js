// File path: backend/services/reprofileService.js
// Purpose: Single shared implementation of "re-profile a dataset after
// a mutation and bump its updated_at/row_count", used by BOTH the
// Dataset Editor (controllers/datasetEditController.js) and AI-powered
// dataset modification (controllers/aiModificationController.js) so
// there is exactly one code path responsible for keeping a dataset's
// profile in sync with its actual current data — never two slightly
// different implementations that could drift apart.

const genericDatasetModel = require('../models/genericDatasetModel');
const { refreshColumnStats } = require('./datasetProfiler');

async function reprofileAndTouch(client, datasetId) {
  const columns = await genericDatasetModel.getColumnsTx(client, datasetId);
  const rows = await genericDatasetModel.getAllRowsTx(client, datasetId);
  const profile = refreshColumnStats(columns, rows);
  await genericDatasetModel.saveProfile(client, datasetId, profile);
  await client.query('UPDATE datasets SET row_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [rows.length, datasetId]);
  return profile;
}

module.exports = { reprofileAndTouch };
