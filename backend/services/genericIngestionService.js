// File path: backend/services/genericIngestionService.js
// Purpose: Given { headers, rows } from any format parser, builds the
// dataset profile and persists columns/rows/profile inside the caller's
// transaction. This is the single ingestion path used for every upload
// (see controllers/datasetController.js) — Superstore-shaped uploads
// additionally get mirrored into the legacy sales_records tables so the
// original Dashboard/Analytics/Reports pages keep working unchanged.

const { buildProfile } = require('./datasetProfiler');
const genericDatasetModel = require('../models/genericDatasetModel');

/**
 * @param {object} client - transactional client from config/db.js's getConnection()
 * @param {number} datasetId
 * @param {string[]} headers
 * @param {object[]} rows
 * @returns {{ profile: object, insertedRows: number }}
 */
async function ingestGenericDataset(client, datasetId, headers, rows) {
  const profile = buildProfile(headers, rows);

  await genericDatasetModel.insertColumns(client, datasetId, profile.columns);
  const insertedRows = await genericDatasetModel.insertRows(client, datasetId, rows);
  await genericDatasetModel.saveProfile(client, datasetId, profile);

  return { profile, insertedRows };
}

module.exports = { ingestGenericDataset };
