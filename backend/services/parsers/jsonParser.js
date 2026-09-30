// File path: backend/services/parsers/jsonParser.js
// Purpose: Parses an arbitrary uploaded JSON file into { headers, rows }.
// Accepts three common shapes:
//   1. A top-level array of flat objects        -> used directly as rows
//   2. An object with one property holding an
//      array of objects (e.g. { "data": [...] },
//      { "records": [...] }, { "employees": [...] }) -> that array is used
//   3. A single flat object                     -> treated as one row
// Nested objects/arrays inside a row are flattened to a JSON string so
// every row still fits a flat table shape for profiling/storage.

const { MAX_ROWS, MAX_COLUMNS } = require('../../config/limits');

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function findRecordArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (isPlainObject(parsed)) {
    // Prefer the first property whose value is an array of objects.
    const arrayProp = Object.values(parsed).find(
      (v) => Array.isArray(v) && v.length > 0 && isPlainObject(v[0])
    );
    if (arrayProp) return arrayProp;
    // Fall back to: single object -> one row.
    return [parsed];
  }
  return null;
}

function flattenValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

/**
 * @param {Buffer} buffer
 * @returns {{ headers: string[], rows: object[], truncated: boolean, totalRowsSeen: number }}
 */
function parseJsonBuffer(buffer) {
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('UNABLE_TO_PARSE');
  }

  const records = findRecordArray(parsed);
  if (!records || records.length === 0 || !isPlainObject(records[0])) {
    throw new Error('NO_READABLE_RECORDS');
  }

  const totalRowsSeen = records.length;
  const truncatedRows = totalRowsSeen > MAX_ROWS;
  const limitedRecords = records.slice(0, MAX_ROWS);

  // Union of keys across a sample of rows, to handle JSON where objects
  // don't all share identical keys.
  const headerSet = new Set();
  limitedRecords.slice(0, 500).forEach((r) => {
    if (isPlainObject(r)) Object.keys(r).forEach((k) => headerSet.add(k));
  });
  let headers = [...headerSet];
  const truncatedColumns = headers.length > MAX_COLUMNS;
  headers = headers.slice(0, MAX_COLUMNS);

  if (headers.length === 0) {
    throw new Error('NO_READABLE_RECORDS');
  }

  const rows = limitedRecords.map((r) => {
    const clean = {};
    headers.forEach((h) => {
      clean[h] = isPlainObject(r) ? flattenValue(r[h]) : null;
    });
    return clean;
  });

  return {
    headers,
    rows,
    truncated: truncatedRows || truncatedColumns,
    totalRowsSeen,
  };
}

module.exports = { parseJsonBuffer };
