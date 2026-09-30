// File path: backend/services/datasetProfiler.js
// Purpose: Turns { headers, rows } (from any format parser) into a full
// dataset profile: per-column inferred type, missing/unique counts,
// sample values, and dataset-level groupings (numeric/categorical/date/
// boolean/id columns) plus a best-effort guess at a "target" column.
// This profile is what powers dynamic KPI cards, dynamic charts, the
// Data Explorer's column list, and the data the AI is grounded on.

const { inferColumnType, isBlank } = require('./typeInference');
const { SAMPLE_VALUES_PER_COLUMN } = require('../config/limits');

const TARGET_NAME_HINTS = [
  'salary', 'revenue', 'sales', 'profit', 'amount', 'price', 'cost', 'score',
  'marks', 'grade', 'total', 'value', 'target', 'outcome', 'rating', 'income',
];

function profileColumn(columnName, rows) {
  const rawValues = rows.map((r) => r[columnName]);
  const nonBlankValues = rawValues.filter((v) => !isBlank(v));
  const missingCount = rawValues.length - nonBlankValues.length;
  const uniqueValues = new Set(nonBlankValues.map((v) => String(v).trim()));

  const inferredType = inferColumnType({
    columnName,
    sampleValues: nonBlankValues.slice(0, 2000),
    uniqueCount: uniqueValues.size,
    totalNonBlank: nonBlankValues.length,
  });

  const sampleValues = [...uniqueValues].slice(0, SAMPLE_VALUES_PER_COLUMN);

  return {
    name: columnName,
    inferredType,
    nullable: missingCount > 0,
    missingCount,
    missingPercentage: rawValues.length > 0 ? Number(((missingCount / rawValues.length) * 100).toFixed(2)) : 0,
    uniqueCount: uniqueValues.size,
    sampleValues,
  };
}

function guessTargetColumn(columns) {
  const numericColumns = columns.filter((c) => c.inferredType === 'integer' || c.inferredType === 'float');
  if (numericColumns.length === 0) return null;

  const hinted = numericColumns.find((c) =>
    TARGET_NAME_HINTS.some((hint) => c.name.toLowerCase().includes(hint))
  );
  if (hinted) return hinted.name;

  // Fall back to the numeric column with the highest unique-value ratio
  // (a continuous measure is more likely a target than a near-constant one).
  const best = numericColumns.reduce((a, b) => (b.uniqueCount > a.uniqueCount ? b : a));
  return best.name;
}

/**
 * @param {string[]} headers
 * @param {object[]} rows
 * @returns {object} full dataset profile
 */
function buildProfile(headers, rows) {
  const columns = headers.map((h) => profileColumn(h, rows));

  const numericColumns = columns.filter((c) => c.inferredType === 'integer' || c.inferredType === 'float').map((c) => c.name);
  const categoricalColumns = columns.filter((c) => c.inferredType === 'categorical').map((c) => c.name);
  const dateColumns = columns.filter((c) => c.inferredType === 'date' || c.inferredType === 'datetime').map((c) => c.name);
  const booleanColumns = columns.filter((c) => c.inferredType === 'boolean').map((c) => c.name);
  const identifierColumns = columns.filter((c) => c.inferredType === 'identifier').map((c) => c.name);
  const textColumns = columns.filter((c) => c.inferredType === 'text').map((c) => c.name);

  return {
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    numericColumns,
    categoricalColumns,
    dateColumns,
    booleanColumns,
    identifierColumns,
    textColumns,
    potentialTargetColumn: guessTargetColumn(columns),
  };
}

/**
 * Recomputes profile STATISTICS (missing/unique/sample counts, row/column
 * counts, and the type-grouping lists) for a set of columns WITHOUT
 * re-inferring their type from the data. This is what the Dataset Editor
 * uses after every row/column mutation: a column's type is either
 * auto-detected once at upload time, or explicitly set by the user via
 * the editor — either way it must NOT silently change just because the
 * data underneath it changed (that's what the explicit "change column
 * type" flow with its preview/confirm step is for).
 *
 * @param {object[]} existingColumns - dataset_columns rows: { name, inferredType, position, ... }
 * @param {object[]} rows - current row data (array of plain objects)
 */
function refreshColumnStats(existingColumns, rows) {
  const columns = existingColumns.map((col) => {
    const stats = profileColumn(col.name, rows);
    return { ...stats, inferredType: col.inferredType }; // keep the locked-in type
  });

  const numericColumns = columns.filter((c) => c.inferredType === 'integer' || c.inferredType === 'float').map((c) => c.name);
  const categoricalColumns = columns.filter((c) => c.inferredType === 'categorical').map((c) => c.name);
  const dateColumns = columns.filter((c) => c.inferredType === 'date' || c.inferredType === 'datetime').map((c) => c.name);
  const booleanColumns = columns.filter((c) => c.inferredType === 'boolean').map((c) => c.name);
  const identifierColumns = columns.filter((c) => c.inferredType === 'identifier').map((c) => c.name);
  const textColumns = columns.filter((c) => c.inferredType === 'text').map((c) => c.name);

  return {
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    numericColumns,
    categoricalColumns,
    dateColumns,
    booleanColumns,
    identifierColumns,
    textColumns,
    potentialTargetColumn: guessTargetColumn(columns),
  };
}

module.exports = { buildProfile, refreshColumnStats, profileColumn, guessTargetColumn };
