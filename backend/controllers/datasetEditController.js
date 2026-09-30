// File path: backend/controllers/datasetEditController.js
// Purpose: The Dataset Editor's backend — add/edit/delete/duplicate rows,
// add/rename/delete/reorder columns, and change a column's type with a
// mandatory preview-before-apply step. Every mutation is wrapped in a
// transaction together with a re-profile of the dataset (services/
// datasetProfiler.refreshColumnStats), so the profile — and therefore
// the Dashboard, Data Explorer, and AI features — never reflects a
// stale, pre-edit version of the data. Works identically regardless of
// how the dataset was created (uploaded, manual, AI-generated, sample).

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const verifyDatasetAccess = require('../utils/verifyDatasetAccess');
const { getConnection, query } = require('../config/db');
const genericDatasetModel = require('../models/genericDatasetModel');
const { reprofileAndTouch } = require('../services/reprofileService');
const columnTypeService = require('../services/columnTypeService');
const { MAX_COLUMNS, MAX_ROWS } = require('../config/limits');

// Re-profiles the dataset from its CURRENT columns/rows and persists it,
// then bumps datasets.updated_at and row_count — see services/
// reprofileService.js (shared with AI-powered modification).

async function loadEditableDataset(user, datasetId) {
  const dataset = await verifyDatasetAccess(user, datasetId);
  if (dataset.dataset_type === 'sales') {
    throw new ApiError(
      400,
      'This dataset is displayed through the original sales-analytics pages. Re-upload it as a fresh dataset to use the Dataset Editor, or use a general-purpose dataset instead.'
    );
  }
  return dataset;
}

// ------------------------------------------------------------------
// ROWS
// ------------------------------------------------------------------

// @route   POST /api/datasets/:id/rows
// @access  Private
const addRow = asyncHandler(async (req, res) => {
  const dataset = await loadEditableDataset(req.user, req.params.id);
  const client = await getConnection();
  try {
    await client.beginTransaction();
    const columns = await genericDatasetModel.getColumnsTx(client, dataset.id);
    if (columns.length === 0) throw new ApiError(400, 'This dataset has no columns yet. Add a column first.');

    const currentCount = await genericDatasetModel.getMaxRowIndexTx(client, dataset.id);
    if (currentCount + 1 >= MAX_ROWS) {
      throw new ApiError(400, `This dataset has reached the maximum supported size of ${MAX_ROWS.toLocaleString()} rows.`);
    }

    const { valid, errors, coercedValues } = columnTypeService.validateRowAgainstColumns(req.body.values || {}, columns);
    if (!valid) throw new ApiError(400, errors.join(' '));

    const rowId = await genericDatasetModel.insertSingleRow(client, dataset.id, currentCount + 1, coercedValues);
    const profile = await reprofileAndTouch(client, dataset.id);
    await client.commit();

    res.status(201).json({ success: true, rowId, values: coercedValues, profile });
  } catch (err) {
    await client.rollback();
    throw err;
  } finally {
    client.release();
  }
});

// @route   PUT /api/datasets/:id/rows/:rowId
// @access  Private
const updateRow = asyncHandler(async (req, res) => {
  const dataset = await loadEditableDataset(req.user, req.params.id);
  const client = await getConnection();
  try {
    await client.beginTransaction();
    const existingRow = await genericDatasetModel.getRowByIdTx(client, dataset.id, req.params.rowId);
    if (!existingRow) throw new ApiError(404, 'Row not found');

    const columns = await genericDatasetModel.getColumnsTx(client, dataset.id);
    const merged = { ...existingRow.data, ...(req.body.values || {}) };
    const { valid, errors, coercedValues } = columnTypeService.validateRowAgainstColumns(merged, columns);
    if (!valid) throw new ApiError(400, errors.join(' '));

    await genericDatasetModel.updateRowData(client, dataset.id, existingRow.id, coercedValues);
    const profile = await reprofileAndTouch(client, dataset.id);
    await client.commit();

    res.json({ success: true, values: coercedValues, profile });
  } catch (err) {
    await client.rollback();
    throw err;
  } finally {
    client.release();
  }
});

// @route   DELETE /api/datasets/:id/rows/:rowId
// @access  Private
const deleteRow = asyncHandler(async (req, res) => {
  const dataset = await loadEditableDataset(req.user, req.params.id);
  const client = await getConnection();
  try {
    await client.beginTransaction();
    const deleted = await genericDatasetModel.deleteRowTx(client, dataset.id, req.params.rowId);
    if (!deleted) throw new ApiError(404, 'Row not found');
    const profile = await reprofileAndTouch(client, dataset.id);
    await client.commit();
    res.json({ success: true, profile });
  } catch (err) {
    await client.rollback();
    throw err;
  } finally {
    client.release();
  }
});

// @route   POST /api/datasets/:id/rows/:rowId/duplicate
// @access  Private
const duplicateRow = asyncHandler(async (req, res) => {
  const dataset = await loadEditableDataset(req.user, req.params.id);
  const client = await getConnection();
  try {
    await client.beginTransaction();
    const existingRow = await genericDatasetModel.getRowByIdTx(client, dataset.id, req.params.rowId);
    if (!existingRow) throw new ApiError(404, 'Row not found');

    const maxIndex = await genericDatasetModel.getMaxRowIndexTx(client, dataset.id);
    if (maxIndex + 1 >= MAX_ROWS) {
      throw new ApiError(400, `This dataset has reached the maximum supported size of ${MAX_ROWS.toLocaleString()} rows.`);
    }
    const newRowId = await genericDatasetModel.insertSingleRow(client, dataset.id, maxIndex + 1, existingRow.data);
    const profile = await reprofileAndTouch(client, dataset.id);
    await client.commit();

    res.status(201).json({ success: true, rowId: newRowId, values: existingRow.data, profile });
  } catch (err) {
    await client.rollback();
    throw err;
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------------
// COLUMNS
// ------------------------------------------------------------------

// @route   POST /api/datasets/:id/columns
// @access  Private
const addColumn = asyncHandler(async (req, res) => {
  const dataset = await loadEditableDataset(req.user, req.params.id);
  const { name, dataType } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'Column name is required.');
  const internalType = columnTypeService.toInternalType(dataType);
  if (!internalType) {
    throw new ApiError(400, `Unsupported column type. Choose one of: ${columnTypeService.EDITABLE_TYPES.join(', ')}.`);
  }

  const client = await getConnection();
  try {
    await client.beginTransaction();
    const columns = await genericDatasetModel.getColumnsTx(client, dataset.id);
    if (columns.some((c) => c.name === name.trim())) {
      throw new ApiError(400, `A column named '${name.trim()}' already exists.`);
    }
    if (columns.length >= MAX_COLUMNS) {
      throw new ApiError(400, `This dataset has reached the maximum supported number of columns (${MAX_COLUMNS}).`);
    }

    await genericDatasetModel.addColumnMeta(client, dataset.id, {
      name: name.trim(),
      inferredType: internalType,
      position: columns.length,
    });
    // Existing rows simply won't have this key — reads treat a missing
    // key as null/empty, matching "existing rows receive NULL values".
    const profile = await reprofileAndTouch(client, dataset.id);
    await client.commit();

    res.status(201).json({ success: true, profile });
  } catch (err) {
    await client.rollback();
    throw err;
  } finally {
    client.release();
  }
});

// @route   PATCH /api/datasets/:id/columns/:columnName/rename
// @access  Private
const renameColumn = asyncHandler(async (req, res) => {
  const dataset = await loadEditableDataset(req.user, req.params.id);
  const { newName } = req.body;
  if (!newName || !newName.trim()) throw new ApiError(400, 'A new column name is required.');

  const client = await getConnection();
  try {
    await client.beginTransaction();
    const columns = await genericDatasetModel.getColumnsTx(client, dataset.id);
    const target = columns.find((c) => c.name === req.params.columnName);
    if (!target) throw new ApiError(404, `Column '${req.params.columnName}' not found.`);
    if (columns.some((c) => c.name === newName.trim())) {
      throw new ApiError(400, `A column named '${newName.trim()}' already exists.`);
    }

    await genericDatasetModel.renameKeyInAllRows(client, dataset.id, req.params.columnName, newName.trim());
    await genericDatasetModel.renameColumnMeta(client, dataset.id, req.params.columnName, newName.trim());
    const profile = await reprofileAndTouch(client, dataset.id);
    await client.commit();

    res.json({ success: true, profile });
  } catch (err) {
    await client.rollback();
    throw err;
  } finally {
    client.release();
  }
});

// @route   GET /api/datasets/:id/columns/:columnName/type-preview?newType=Integer
// @access  Private
const previewColumnTypeChange = asyncHandler(async (req, res) => {
  const dataset = await loadEditableDataset(req.user, req.params.id);
  const internalType = columnTypeService.toInternalType(req.query.newType);
  if (!internalType) {
    throw new ApiError(400, `Unsupported target type. Choose one of: ${columnTypeService.EDITABLE_TYPES.join(', ')}.`);
  }

  const columns = await genericDatasetModel.getColumns(dataset.id);
  if (!columns.some((c) => c.name === req.params.columnName)) {
    throw new ApiError(404, `Column '${req.params.columnName}' not found.`);
  }

  const rows = await query('SELECT id, data FROM dataset_rows WHERE dataset_id = ?', [dataset.id]);
  const rowsWithIds = rows.rows.map((r) => ({ id: r.id, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data }));

  const preview = columnTypeService.previewTypeConversion(rowsWithIds, req.params.columnName, internalType);
  res.json({ success: true, preview });
});

// @route   PATCH /api/datasets/:id/columns/:columnName/type
// @access  Private
// Body: { newType: 'Integer', confirmed: true }
// If the preview would show any data loss, the caller MUST pass
// confirmed:true (obtained after showing the user the preview) — this
// is enforced server-side, not just in the UI, so the "warn before you
// convert" requirement can't be bypassed by a direct API call either.
const changeColumnType = asyncHandler(async (req, res) => {
  const dataset = await loadEditableDataset(req.user, req.params.id);
  const internalType = columnTypeService.toInternalType(req.body.newType);
  if (!internalType) {
    throw new ApiError(400, `Unsupported target type. Choose one of: ${columnTypeService.EDITABLE_TYPES.join(', ')}.`);
  }

  const client = await getConnection();
  try {
    await client.beginTransaction();
    const columns = await genericDatasetModel.getColumnsTx(client, dataset.id);
    const target = columns.find((c) => c.name === req.params.columnName);
    if (!target) throw new ApiError(404, `Column '${req.params.columnName}' not found.`);

    const rowsWithIds = await genericDatasetModel.getAllRowsWithIdsTx(client, dataset.id);
    const flatRows = rowsWithIds.map((r) => ({ id: r.id, data: r.data }));
    const preview = columnTypeService.previewTypeConversion(flatRows, req.params.columnName, internalType);

    if (!preview.safe && !req.body.confirmed) {
      throw new ApiError(
        409,
        `Changing '${req.params.columnName}' to ${preview.newType} would clear ${preview.wouldFailCount} value(s) that can't be converted. Confirm to proceed, or cancel to keep the current type.`
      );
    }

    const updates = flatRows.map((r) => {
      const result = columnTypeService.coerceForType(r.data[req.params.columnName], internalType);
      return { id: r.id, value: result.ok ? result.value : null };
    });
    await genericDatasetModel.applyColumnValues(client, dataset.id, req.params.columnName, updates);
    await genericDatasetModel.updateColumnTypeMeta(client, dataset.id, req.params.columnName, internalType);
    const profile = await reprofileAndTouch(client, dataset.id);
    await client.commit();

    res.json({ success: true, nullifiedCount: preview.wouldFailCount, profile });
  } catch (err) {
    await client.rollback();
    throw err;
  } finally {
    client.release();
  }
});

// @route   DELETE /api/datasets/:id/columns/:columnName
// @access  Private
const deleteColumn = asyncHandler(async (req, res) => {
  const dataset = await loadEditableDataset(req.user, req.params.id);
  const client = await getConnection();
  try {
    await client.beginTransaction();
    const columns = await genericDatasetModel.getColumnsTx(client, dataset.id);
    if (!columns.some((c) => c.name === req.params.columnName)) {
      throw new ApiError(404, `Column '${req.params.columnName}' not found.`);
    }
    if (columns.length <= 1) {
      throw new ApiError(400, 'A dataset must have at least one column.');
    }

    await genericDatasetModel.removeKeyFromAllRows(client, dataset.id, req.params.columnName);
    await genericDatasetModel.deleteColumnMeta(client, dataset.id, req.params.columnName);
    // Close the position gap so reordering stays contiguous.
    const remaining = columns.filter((c) => c.name !== req.params.columnName).map((c) => c.name);
    await genericDatasetModel.reorderColumnsMeta(client, dataset.id, remaining);
    const profile = await reprofileAndTouch(client, dataset.id);
    await client.commit();

    res.json({ success: true, profile });
  } catch (err) {
    await client.rollback();
    throw err;
  } finally {
    client.release();
  }
});

// @route   PATCH /api/datasets/:id/columns/reorder
// @access  Private
// Body: { orderedNames: ['col2', 'col1', 'col3'] }
const reorderColumns = asyncHandler(async (req, res) => {
  const dataset = await loadEditableDataset(req.user, req.params.id);
  const { orderedNames } = req.body;
  if (!Array.isArray(orderedNames) || orderedNames.length === 0) {
    throw new ApiError(400, 'orderedNames must be a non-empty array of column names.');
  }

  const client = await getConnection();
  try {
    await client.beginTransaction();
    const columns = await genericDatasetModel.getColumnsTx(client, dataset.id);
    const currentNames = new Set(columns.map((c) => c.name));
    const requestedNames = new Set(orderedNames);
    if (currentNames.size !== requestedNames.size || [...currentNames].some((n) => !requestedNames.has(n))) {
      throw new ApiError(400, 'orderedNames must contain exactly the dataset\'s current columns.');
    }

    await genericDatasetModel.reorderColumnsMeta(client, dataset.id, orderedNames);
    const profile = await reprofileAndTouch(client, dataset.id);
    await client.commit();

    res.json({ success: true, profile });
  } catch (err) {
    await client.rollback();
    throw err;
  } finally {
    client.release();
  }
});

module.exports = {
  addRow,
  updateRow,
  deleteRow,
  duplicateRow,
  addColumn,
  renameColumn,
  previewColumnTypeChange,
  changeColumnType,
  deleteColumn,
  reorderColumns,
};
