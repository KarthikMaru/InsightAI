// File path: backend/controllers/datasetController.js
// Purpose: Handles dataset upload + ingestion, serving the bundled sample
// dataset, listing/inspecting/deleting datasets.
//
// UPDATED: uploads are no longer restricted to Superstore-shaped CSVs.
// Any CSV/JSON/Excel/XML/SQL file is parsed by services/parsers/, then:
//   1. ALWAYS profiled + stored in the generic dataset_columns/
//      dataset_rows/dataset_profiles tables (services/genericIngestionService.js).
//      This is what powers the Data Explorer, dynamic dashboard, dynamic
//      charts, and AI features for ANY dataset.
//   2. If the column set matches the classic Superstore schema (Order
//      ID, Order Date, Customer Name, ...), the rows are ALSO mirrored
//      into the original sales_records tables (services/ingestionService.js)
//      so the original Dashboard/Analytics/Reports pages keep working
//      unchanged for that dataset. dataset.dataset_type records which
//      path applies ('sales' or 'generic').
//
// There is no longer a hardcoded "CSV is missing required columns"
// rejection — a dataset with different columns is simply profiled and
// analyzed generically instead of being rejected.

const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { query, getConnection } = require('../config/db');
const businessModel = require('../models/businessModel');
const datasetModel = require('../models/datasetModel');
const genericDatasetModel = require('../models/genericDatasetModel');
const { parseUploadedFile } = require('../services/parsers');
const { parseJsonBuffer } = require('../services/parsers/jsonParser');
const { detectAndConvertSalesRows } = require('../services/salesShapeAdapter');
const { ingestRecords } = require('../services/ingestionService');
const { ingestGenericDataset } = require('../services/genericIngestionService');
const { refreshColumnStats } = require('../services/datasetProfiler');
const { toInternalType, EDITABLE_TYPES } = require('../services/columnTypeService');
const { MAX_COLUMNS } = require('../config/limits');
const geminiService = require('../services/geminiService');

const SAMPLE_CSV_PATH = path.join(__dirname, '..', 'database', 'sampleData', 'superstore_sample.csv');

async function getOwnedBusiness(userId) {
  const business = await businessModel.findByUserId(userId);
  if (!business) throw new ApiError(404, 'No business profile found for this user');
  return business;
}

// Shared ingestion core: takes already-parsed { headers, rows } (from a
// file, or — for AI-generated datasets — from Gemini's JSON output run
// through the same parser an uploaded .json file goes through) and does
// everything downstream identically: sales-shape detection, generic
// profiling/storage, optional sales_records mirroring, activity log.
// This is what guarantees an AI-generated or manually-typed dataset gets
// the EXACT same validation and row/column caps as an upload — there is
// only one ingestion path, not three parallel ones.
async function ingestParsedRows({ businessId, name, originalFilename, isSample, headers, rows, fileType, userId, sourceType, activityAction }) {
  if (rows.length === 0) {
    throw new ApiError(400, 'The file contains no readable records.');
  }

  const salesShape = detectAndConvertSalesRows(headers, rows);
  const isSalesShaped = salesShape !== null && salesShape.records.length > 0;
  const datasetType = isSalesShaped ? 'sales' : 'generic';

  const dataset = await datasetModel.create({ businessId, name, originalFilename, isSample, sourceType });
  await query('UPDATE datasets SET dataset_type = ?, file_type = ? WHERE id = ?', [datasetType, fileType, dataset.id]);

  const client = await getConnection();
  try {
    await client.beginTransaction();

    const { profile, insertedRows: genericRowsInserted } = await ingestGenericDataset(client, dataset.id, headers, rows);

    let salesRowsInserted = 0;
    let salesRowsRejected = 0;
    if (isSalesShaped) {
      const salesResult = await ingestRecords(client, dataset.id, salesShape.records);
      salesRowsInserted = salesResult.insertedRows;
      salesRowsRejected = salesShape.errors.length;
    }

    await client.commit();

    const finalRowCount = isSalesShaped ? salesRowsInserted : genericRowsInserted;
    const readyDataset = await datasetModel.markReady(dataset.id, finalRowCount);

    await query(
      `INSERT INTO activities (user_id, action, metadata) VALUES (?, ?, ?)`,
      [userId, activityAction, JSON.stringify({ datasetId: dataset.id, rows: finalRowCount, datasetType, fileType })]
    );

    return {
      dataset: { ...readyDataset, dataset_type: datasetType, file_type: fileType },
      datasetType,
      fileType,
      rowsInserted: finalRowCount,
      rowsRejected: salesRowsRejected,
      profile,
    };
  } catch (err) {
    await client.rollback();
    await datasetModel.markFailed(dataset.id);
    throw err;
  } finally {
    client.release();
  }
}

async function runIngestion({ businessId, name, originalFilename, isSample, buffer, userId, sourceType }) {
  const parsed = parseUploadedFile(buffer, originalFilename);
  const { fileType, headers, rows, truncated, totalRowsSeen } = parsed;

  const result = await ingestParsedRows({
    businessId, name, originalFilename, isSample, headers, rows, fileType, userId,
    sourceType: sourceType || (isSample ? 'sample' : 'uploaded'),
    activityAction: 'dataset_uploaded',
  });

  return { ...result, totalRowsSeen, truncated };
}

// @route   POST /api/datasets/upload
// @access  Private
const uploadDataset = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'No file uploaded. Attach a CSV, JSON, Excel, XML, or SQL file as "file".');
  }

  const business = await getOwnedBusiness(req.user.id);
  const datasetName = req.body.name?.trim() || req.file.originalname.replace(/\.[^.]+$/, '');

  const result = await runIngestion({
    businessId: business.id,
    name: datasetName,
    originalFilename: req.file.originalname,
    isSample: false,
    buffer: req.file.buffer,
    userId: req.user.id,
  });

  res.status(201).json({ success: true, message: 'Dataset uploaded and processed', ...result });
});

// @route   POST /api/datasets/sample
// @access  Private
const useSampleDataset = asyncHandler(async (req, res) => {
  const business = await getOwnedBusiness(req.user.id);
  const buffer = fs.readFileSync(SAMPLE_CSV_PATH);

  const result = await runIngestion({
    businessId: business.id,
    name: 'Sample Superstore Dataset',
    originalFilename: 'superstore_sample.csv',
    isSample: true,
    buffer,
    userId: req.user.id,
  });

  res.status(201).json({ success: true, message: 'Sample dataset loaded', ...result });
});

// @route   POST /api/datasets/manual
// @access  Private
// Body: { name, columns: [{ name, dataType }] }
// Creates an empty (zero-row) dataset from a user-declared schema — the
// "Create Dataset" workflow. It goes through the exact same generic
// dataset_columns/dataset_rows/dataset_profiles tables as an upload, so
// the Dataset Editor, Data Explorer, Dashboard, and AI features treat it
// identically to an uploaded dataset from the moment it's created.
const createManualDataset = asyncHandler(async (req, res) => {
  const { name, columns } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'Dataset name is required.');
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new ApiError(400, 'At least one column is required.');
  }
  if (columns.length > MAX_COLUMNS) {
    throw new ApiError(400, `A dataset can have at most ${MAX_COLUMNS} columns.`);
  }

  const seenNames = new Set();
  const preparedColumns = columns.map((c) => {
    if (!c.name || !c.name.trim()) throw new ApiError(400, 'Every column needs a name.');
    const trimmedName = c.name.trim();
    if (seenNames.has(trimmedName)) throw new ApiError(400, `Duplicate column name: '${trimmedName}'.`);
    seenNames.add(trimmedName);

    const internalType = toInternalType(c.dataType);
    if (!internalType) {
      throw new ApiError(400, `Unsupported type '${c.dataType}' for column '${trimmedName}'. Choose one of: ${EDITABLE_TYPES.join(', ')}.`);
    }
    return {
      name: trimmedName,
      inferredType: internalType,
      nullable: true,
      missingCount: 0,
      missingPercentage: 0,
      uniqueCount: 0,
      sampleValues: [],
    };
  });

  const business = await getOwnedBusiness(req.user.id);
  const dataset = await datasetModel.create({
    businessId: business.id,
    name: name.trim(),
    originalFilename: null,
    isSample: false,
    sourceType: 'manual',
  });
  await query('UPDATE datasets SET dataset_type = ?, file_type = ? WHERE id = ?', ['generic', null, dataset.id]);

  const client = await getConnection();
  try {
    await client.beginTransaction();
    await genericDatasetModel.insertColumns(client, dataset.id, preparedColumns);
    // Use refreshColumnStats (not buildProfile) so the columns keep the
    // TYPES THE USER DECLARED rather than inference re-guessing 'text'
    // for every column just because there's no data yet.
    const profile = refreshColumnStats(preparedColumns, []);
    await genericDatasetModel.saveProfile(client, dataset.id, profile);
    await client.commit();

    const readyDataset = await datasetModel.markReady(dataset.id, 0);
    await query(
      'INSERT INTO activities (user_id, action, metadata) VALUES (?, ?, ?)',
      [req.user.id, 'dataset_created_manually', JSON.stringify({ datasetId: dataset.id, columns: preparedColumns.length })]
    );

    res.status(201).json({ success: true, dataset: { ...readyDataset, dataset_type: 'generic' }, profile });
  } catch (err) {
    await client.rollback();
    await datasetModel.markFailed(dataset.id);
    throw err;
  } finally {
    client.release();
  }
});

// @route   POST /api/datasets/generate-ai
// @access  Private
// Body: { prompt, rowCount, name? }
// "Generate Dataset with AI". Gemini's raw text output is NEVER trusted
// directly: it's parsed, then re-validated through parseJsonBuffer — the
// exact same function an uploaded .json file goes through — so a
// generated dataset gets identical structural validation, type
// inference, and row/column caps as any upload. If Gemini returns
// malformed JSON, an empty result, or fails outright (see
// geminiService.callGemini's timeout/rate-limit/invalid-key handling),
// this throws a clear ApiError instead of ever crashing the process or
// silently creating a broken dataset.
const generateAiDataset = asyncHandler(async (req, res) => {
  const { prompt, rowCount } = req.body;
  if (!prompt || !prompt.trim()) {
    throw new ApiError(400, 'Describe the dataset you want to generate, e.g. "500 employees with department, salary, and joining date".');
  }

  const rawText = await geminiService.generateDatasetFromPrompt({ prompt: prompt.trim(), rowCount });

  let parsedJson;
  try {
    const cleaned = rawText.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    parsedJson = JSON.parse(cleaned);
  } catch (err) {
    throw new ApiError(502, 'The AI returned an invalid dataset structure. Please try again or rephrase your request.');
  }

  // Re-parse through the SAME validator an uploaded JSON file uses —
  // this is the "never blindly trust AI output" safeguard: whatever
  // shape/quirks Gemini produced, it's normalized exactly like any other
  // JSON upload (missing/malformed rows dropped, headers unioned, capped
  // at MAX_ROWS/MAX_COLUMNS) rather than trusted as pre-validated.
  // We extract the "rows" array ourselves first (rather than handing the
  // whole {datasetName, columns, rows} envelope to the generic
  // array-finder) so an empty/missing rows array is correctly treated as
  // "no data" instead of the envelope object itself being misread as a
  // single row.
  const rowsArray = Array.isArray(parsedJson?.rows) ? parsedJson.rows : Array.isArray(parsedJson) ? parsedJson : null;
  if (!rowsArray) {
    throw new ApiError(502, 'The AI did not return any usable rows. Please try again or rephrase your request.');
  }

  let headers, rows;
  try {
    const buffer = Buffer.from(JSON.stringify(rowsArray));
    ({ headers, rows } = parseJsonBuffer(buffer));
  } catch (err) {
    throw new ApiError(502, 'The AI did not return any usable rows. Please try again or rephrase your request.');
  }

  const business = await getOwnedBusiness(req.user.id);
  const datasetName = req.body.name?.trim() || parsedJson.datasetName || `AI Generated: ${prompt.trim().slice(0, 60)}`;

  const result = await ingestParsedRows({
    businessId: business.id,
    name: datasetName,
    originalFilename: null,
    isSample: false,
    headers,
    rows,
    fileType: 'json',
    userId: req.user.id,
    sourceType: 'ai_generated',
    activityAction: 'dataset_generated_ai',
  });

  // Surface duplicate-looking identifier values as a warning rather than
  // blocking — the spec's "validate duplicate IDs if relevant" ask is
  // informational, not a hard rejection (a generated demo dataset with
  // a couple of accidental duplicate IDs is still usable).
  const duplicateIdWarnings = result.profile.identifierColumns
    .filter((colName) => {
      const col = result.profile.columns.find((c) => c.name === colName);
      return col && col.uniqueCount < result.profile.rowCount;
    });

  res.status(201).json({
    success: true,
    message: rows.length < (parseInt(rowCount, 10) || 50) ? 'Dataset generated (fewer rows than requested were usable).' : 'Dataset generated',
    ...result,
    requestedRowCount: parseInt(rowCount, 10) || 50,
    duplicateIdWarnings,
  });
});

// @route   GET /api/datasets
// @access  Private
const listDatasets = asyncHandler(async (req, res) => {
  const business = await getOwnedBusiness(req.user.id);
  const datasets = await datasetModel.findByBusiness(business.id);
  res.json({ success: true, datasets });
});

// @route   GET /api/datasets/:id
// @access  Private
const getDataset = asyncHandler(async (req, res) => {
  const business = await getOwnedBusiness(req.user.id);
  const dataset = await datasetModel.findById(req.params.id);

  if (!dataset || dataset.business_id !== business.id) {
    throw new ApiError(404, 'Dataset not found');
  }

  if (dataset.dataset_type === 'sales') {
    const { rows: preview } = await query(
      `SELECT sr.id, sr.order_id, sr.order_date, p.name AS product, c.name AS category,
              r.name AS region, cu.name AS customer_name, sr.quantity, sr.sales, sr.profit, sr.discount
       FROM sales_records sr
       LEFT JOIN products p ON p.id = sr.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN regions r ON r.id = sr.region_id
       LEFT JOIN customers cu ON cu.id = sr.customer_id
       WHERE sr.dataset_id = ?
       ORDER BY sr.order_date DESC
       LIMIT 20`,
      [dataset.id]
    );
    return res.json({ success: true, dataset, preview });
  }

  const profile = await genericDatasetModel.getProfile(dataset.id);
  const { records: preview } = await genericDatasetModel.getPagedRows(dataset.id, { page: 1, pageSize: 20 });
  res.json({ success: true, dataset, profile, preview });
});

// @route   DELETE /api/datasets/:id
// @access  Private (owner or admin)
const deleteDataset = asyncHandler(async (req, res) => {
  const dataset = await datasetModel.findById(req.params.id);
  if (!dataset) throw new ApiError(404, 'Dataset not found');

  if (req.user.role !== 'admin') {
    const business = await getOwnedBusiness(req.user.id);
    if (dataset.business_id !== business.id) {
      throw new ApiError(403, 'You do not have permission to delete this dataset');
    }
  }

  await datasetModel.delete(dataset.id);
  await query(
    `INSERT INTO activities (user_id, action, metadata) VALUES (?, ?, ?)`,
    [req.user.id, 'dataset_deleted', JSON.stringify({ datasetId: dataset.id })]
  );

  res.json({ success: true, message: 'Dataset deleted' });
});

// @route   PATCH /api/datasets/:id
// @access  Private
// Body: { name }
const renameDataset = asyncHandler(async (req, res) => {
  const business = await getOwnedBusiness(req.user.id);
  const dataset = await datasetModel.findById(req.params.id);
  if (!dataset || dataset.business_id !== business.id) throw new ApiError(404, 'Dataset not found');

  const { name } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'A dataset name is required.');

  const updated = await datasetModel.rename(dataset.id, name.trim());
  res.json({ success: true, dataset: updated });
});

// @route   POST /api/datasets/:id/duplicate
// @access  Private
// Creates an independent copy: editing the copy never affects the
// original. Reuses the exact same ingestion pipeline as an upload (see
// ingestParsedRows above) — the copied rows are re-profiled and, if the
// original was sales-shaped, re-mirrored into sales_records — rather
// than a raw table-to-table SQL copy, so a duplicate is guaranteed to
// behave identically to any other dataset from the moment it's created.
const duplicateDataset = asyncHandler(async (req, res) => {
  const business = await getOwnedBusiness(req.user.id);
  const original = await datasetModel.findById(req.params.id);
  if (!original || original.business_id !== business.id) throw new ApiError(404, 'Dataset not found');

  const profile = await genericDatasetModel.getProfile(original.id);
  if (!profile) throw new ApiError(404, 'No data found for this dataset to duplicate.');

  const copyName = `${original.name} Copy`;

  if (profile.rowCount === 0) {
    // Empty dataset (e.g. a freshly created manual one with no rows
    // yet) — ingestParsedRows requires at least one row, so copy the
    // schema directly instead.
    const dataset = await datasetModel.create({
      businessId: business.id, name: copyName, originalFilename: original.original_filename,
      isSample: false, sourceType: original.source_type,
    });
    await query('UPDATE datasets SET dataset_type = ?, file_type = ? WHERE id = ?', [original.dataset_type, original.file_type, dataset.id]);

    const client = await getConnection();
    try {
      await client.beginTransaction();
      await genericDatasetModel.insertColumns(client, dataset.id, profile.columns);
      await genericDatasetModel.saveProfile(client, dataset.id, refreshColumnStats(profile.columns, []));
      await client.commit();
      const readyDataset = await datasetModel.markReady(dataset.id, 0);
      return res.status(201).json({ success: true, dataset: readyDataset });
    } catch (err) {
      await client.rollback();
      await datasetModel.markFailed(dataset.id);
      throw err;
    } finally {
      client.release();
    }
  }

  const headers = profile.columns.map((c) => c.name);
  const rows = await genericDatasetModel.getAllRows(original.id);

  const result = await ingestParsedRows({
    businessId: business.id,
    name: copyName,
    originalFilename: original.original_filename,
    isSample: false,
    headers,
    rows,
    fileType: original.file_type,
    userId: req.user.id,
    sourceType: original.source_type,
    activityAction: 'dataset_duplicated',
  });

  res.status(201).json({ success: true, dataset: result.dataset });
});

module.exports = {
  uploadDataset, useSampleDataset, createManualDataset, generateAiDataset,
  listDatasets, getDataset, deleteDataset, renameDataset, duplicateDataset,
};
