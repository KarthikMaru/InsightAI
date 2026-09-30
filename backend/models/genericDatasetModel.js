// File path: backend/models/genericDatasetModel.js
// Purpose: Data-access layer for the format-agnostic dataset tables
// (dataset_columns, dataset_rows, dataset_profiles). This is where ANY
// uploaded dataset's schema and row data live — there are no hardcoded
// columns like order_id/sales/profit here, only a JSON `data` blob per
// row plus a profiled column list per dataset. The pre-existing
// sales_records/products/categories/... tables and datasetModel.js are
// untouched and continue to serve Superstore-shaped datasets exactly as
// before (see controllers/datasetController.js for how the two paths
// are combined).

const { query } = require('../config/db');

const CHUNK_SIZE = 500;

const genericDatasetModel = {
  async insertColumns(client, datasetId, columns) {
    if (columns.length === 0) return;
    const values = columns.map((c, i) => [
      datasetId,
      i,
      c.name,
      c.inferredType,
      c.nullable,
      c.missingCount,
      c.missingPercentage,
      c.uniqueCount,
      JSON.stringify(c.sampleValues || []),
    ]);
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    await client.query(
      `INSERT INTO dataset_columns
        (dataset_id, position, name, inferred_type, nullable, missing_count, missing_percentage, unique_count, sample_values)
       VALUES ${placeholders}`,
      values.flat()
    );
  },

  async insertRows(client, datasetId, rows) {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const values = chunk.map((row, idx) => [datasetId, i + idx, JSON.stringify(row)]);
      const placeholders = values.map(() => '(?, ?, ?)').join(', ');
      await client.query(
        `INSERT INTO dataset_rows (dataset_id, row_index, data) VALUES ${placeholders}`,
        values.flat()
      );
      inserted += chunk.length;
    }
    return inserted;
  },

  async saveProfile(client, datasetId, profile) {
    await client.query(
      `INSERT INTO dataset_profiles (dataset_id, profile) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE profile = VALUES(profile), created_at = CURRENT_TIMESTAMP`,
      [datasetId, JSON.stringify(profile)]
    );
  },

  async getProfile(datasetId) {
    const { rows } = await query('SELECT profile FROM dataset_profiles WHERE dataset_id = ?', [datasetId]);
    if (rows.length === 0) return null;
    return typeof rows[0].profile === 'string' ? JSON.parse(rows[0].profile) : rows[0].profile;
  },

  async getColumns(datasetId) {
    const { rows } = await query(
      `SELECT name, inferred_type, nullable, missing_count, missing_percentage, unique_count, sample_values
       FROM dataset_columns WHERE dataset_id = ? ORDER BY position ASC`,
      [datasetId]
    );
    return rows.map((r) => ({
      ...r,
      sample_values: typeof r.sample_values === 'string' ? JSON.parse(r.sample_values) : r.sample_values,
    }));
  },

  // Fetches ALL rows for a dataset (bounded by MAX_ROWS at ingestion
  // time) as plain JS objects — used for in-memory analytics/AI
  // grounding where a full scan is required (correlations, group-bys).
  async getAllRows(datasetId) {
    const { rows } = await query(
      'SELECT data FROM dataset_rows WHERE dataset_id = ? ORDER BY row_index ASC',
      [datasetId]
    );
    return rows.map((r) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data));
  },

  // Same as above but keeps each row's id — used by AI-modification
  // preview (services/datasetModificationService.js), which needs row
  // ids to build an apply plan without a write transaction just for reading.
  async getAllRowsWithIds(datasetId) {
    const { rows } = await query(
      'SELECT id, data FROM dataset_rows WHERE dataset_id = ? ORDER BY row_index ASC',
      [datasetId]
    );
    return rows.map((r) => ({ id: r.id, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data }));
  },

  async getRowCount(datasetId) {
    const { rows } = await query('SELECT COUNT(*) AS total FROM dataset_rows WHERE dataset_id = ?', [datasetId]);
    return rows[0].total;
  },

  // ---------------------------------------------------------------
  // MUTABLE DATASET ENGINE (Dataset Editor)
  // Everything below runs inside a caller-supplied transactional
  // `client` (see controllers/datasetEditController.js), so a row
  // mutation and its subsequent re-profile commit or roll back
  // together and never leave a dataset half-updated.
  // ---------------------------------------------------------------

  async getColumnsTx(client, datasetId) {
    const { rows } = await client.query(
      `SELECT id, name, inferred_type AS inferredType, nullable, missing_count AS missingCount,
              missing_percentage AS missingPercentage, unique_count AS uniqueCount, sample_values AS sampleValues, position
       FROM dataset_columns WHERE dataset_id = ? ORDER BY position ASC`,
      [datasetId]
    );
    return rows.map((r) => ({
      ...r,
      sampleValues: typeof r.sampleValues === 'string' ? JSON.parse(r.sampleValues) : r.sampleValues,
    }));
  },

  async getAllRowsTx(client, datasetId) {
    const { rows } = await client.query('SELECT data FROM dataset_rows WHERE dataset_id = ? ORDER BY row_index ASC', [datasetId]);
    return rows.map((r) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data));
  },

  async getAllRowsWithIdsTx(client, datasetId) {
    const { rows } = await client.query('SELECT id, row_index AS rowIndex, data FROM dataset_rows WHERE dataset_id = ? ORDER BY row_index ASC', [datasetId]);
    return rows.map((r) => ({
      id: r.id,
      rowIndex: r.rowIndex,
      data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
    }));
  },

  async getRowByIdTx(client, datasetId, rowId) {
    const { rows } = await client.query('SELECT id, row_index AS rowIndex, data FROM dataset_rows WHERE id = ? AND dataset_id = ?', [rowId, datasetId]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, rowIndex: r.rowIndex, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data };
  },

  async getMaxRowIndexTx(client, datasetId) {
    const { rows } = await client.query('SELECT MAX(row_index) AS maxIndex FROM dataset_rows WHERE dataset_id = ?', [datasetId]);
    return rows[0].maxIndex === null ? -1 : rows[0].maxIndex;
  },

  async insertSingleRow(client, datasetId, rowIndex, values) {
    const { insertId } = await client.query(
      'INSERT INTO dataset_rows (dataset_id, row_index, data) VALUES (?, ?, ?)',
      [datasetId, rowIndex, JSON.stringify(values)]
    );
    return insertId;
  },

  async updateRowData(client, datasetId, rowId, values) {
    await client.query('UPDATE dataset_rows SET data = ? WHERE id = ? AND dataset_id = ?', [JSON.stringify(values), rowId, datasetId]);
  },

  async deleteRowTx(client, datasetId, rowId) {
    const { affectedRows } = await client.query('DELETE FROM dataset_rows WHERE id = ? AND dataset_id = ?', [rowId, datasetId]);
    return affectedRows > 0;
  },

  async addColumnMeta(client, datasetId, { name, inferredType, position }) {
    await client.query(
      `INSERT INTO dataset_columns (dataset_id, position, name, inferred_type, nullable, missing_count, missing_percentage, unique_count, sample_values)
       VALUES (?, ?, ?, ?, TRUE, 0, 0, 0, ?)`,
      [datasetId, position, name, inferredType, JSON.stringify([])]
    );
  },

  async renameColumnMeta(client, datasetId, oldName, newName) {
    await client.query('UPDATE dataset_columns SET name = ? WHERE dataset_id = ? AND name = ?', [newName, datasetId, oldName]);
  },

  async updateColumnTypeMeta(client, datasetId, columnName, newInternalType) {
    await client.query('UPDATE dataset_columns SET inferred_type = ? WHERE dataset_id = ? AND name = ?', [newInternalType, datasetId, columnName]);
  },

  async deleteColumnMeta(client, datasetId, columnName) {
    await client.query('DELETE FROM dataset_columns WHERE dataset_id = ? AND name = ?', [datasetId, columnName]);
  },

  async reorderColumnsMeta(client, datasetId, orderedNames) {
    for (let i = 0; i < orderedNames.length; i++) {
      await client.query('UPDATE dataset_columns SET position = ? WHERE dataset_id = ? AND name = ?', [i, datasetId, orderedNames[i]]);
    }
  },

  // Renames a JSON key across every row in one statement. The old/new
  // paths are bound parameters, not concatenated SQL, so an arbitrary
  // column name can only ever act as a JSON path VALUE, never alter the
  // query's structure.
  async renameKeyInAllRows(client, datasetId, oldName, newName) {
    const oldPath = `$."${oldName.replace(/"/g, '\\"')}"`;
    const newPath = `$."${newName.replace(/"/g, '\\"')}"`;
    await client.query(
      `UPDATE dataset_rows
       SET data = JSON_SET(JSON_REMOVE(data, ?), ?, JSON_EXTRACT(data, ?))
       WHERE dataset_id = ?`,
      [oldPath, newPath, oldPath, datasetId]
    );
  },

  async removeKeyFromAllRows(client, datasetId, columnName) {
    const path = `$."${columnName.replace(/"/g, '\\"')}"`;
    await client.query('UPDATE dataset_rows SET data = JSON_REMOVE(data, ?) WHERE dataset_id = ?', [path, datasetId]);
  },

  // Applies a bulk column type conversion: `updates` is [{ id, value }],
  // pre-computed by the caller (columnTypeService) with every value
  // already validated/coerced or nulled out. Runs one UPDATE per row —
  // bounded by config/limits.MAX_ROWS, acceptable for this app's scale.
  async applyColumnValues(client, datasetId, columnName, updates) {
    const path = `$."${columnName.replace(/"/g, '\\"')}"`;
    for (const { id, value } of updates) {
      await client.query('UPDATE dataset_rows SET data = JSON_SET(data, ?, CAST(? AS JSON)) WHERE id = ? AND dataset_id = ?', [
        path,
        JSON.stringify(value),
        id,
        datasetId,
      ]);
    }
  },

  // Paginated/sorted/searched fetch for the Data Explorer. Sorting and
  // filtering both go through JSON_EXTRACT with the JSON path passed as
  // a bound parameter (never string-concatenated), so an arbitrary
  // column name can never alter the query structure.
  async getPagedRows(datasetId, { page, pageSize, search, sortColumn, sortDir, sortIsNumeric, filterColumn, filterValue }) {
    const clauses = ['dataset_id = ?'];
    const params = [datasetId];

    if (search) {
      clauses.push('CAST(data AS CHAR) LIKE ?');
      params.push(`%${search}%`);
    }
    if (filterColumn && filterValue) {
      clauses.push('JSON_UNQUOTE(JSON_EXTRACT(data, ?)) = ?');
      params.push(`$."${filterColumn.replace(/"/g, '\\"')}"`, filterValue);
    }

    const where = clauses.join(' AND ');
    const countResult = await query(`SELECT COUNT(*) AS total FROM dataset_rows WHERE ${where}`, params);
    const total = countResult.rows[0].total;

    let orderClause = 'row_index ASC';
    const orderParams = [];
    if (sortColumn) {
      const extractExpr = 'JSON_UNQUOTE(JSON_EXTRACT(data, ?))';
      orderParams.push(`$."${sortColumn.replace(/"/g, '\\"')}"`);
      orderClause = `${sortIsNumeric ? `CAST(${extractExpr} AS DECIMAL(30,6))` : extractExpr} ${sortDir === 'asc' ? 'ASC' : 'DESC'}`;
    }

    const offset = (page - 1) * pageSize;
    const { rows } = await query(
      `SELECT id, row_index, data FROM dataset_rows WHERE ${where} ORDER BY ${orderClause} LIMIT ? OFFSET ?`,
      [...params, ...orderParams, pageSize, offset]
    );

    return {
      total,
      records: rows.map((r) => ({
        id: r.id,
        rowIndex: r.row_index,
        ...(typeof r.data === 'string' ? JSON.parse(r.data) : r.data),
      })),
    };
  },
};

module.exports = genericDatasetModel;
