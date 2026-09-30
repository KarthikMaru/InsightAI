// File path: backend/services/parsers/csvParser.js
// Purpose: Parses an arbitrary CSV buffer (ANY column layout — not just
// Superstore-style sales data) into { headers, rows } using Papa Parse.
// This is part of the new format-agnostic ingestion pipeline; it does
// NOT validate against any fixed schema. The legacy backend/services/
// csvService.js (Superstore-specific validation) is left untouched and
// still powers the original sales_records ingestion path for backward
// compatibility.

const Papa = require('papaparse');
const { MAX_ROWS, MAX_COLUMNS } = require('../../config/limits');

/**
 * @param {Buffer} buffer - raw uploaded file contents
 * @returns {{ headers: string[], rows: object[], truncated: boolean, totalRowsSeen: number }}
 */
function parseCsvBuffer(buffer) {
  const text = buffer.toString('utf8');
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false, // we do our own type inference downstream
    transformHeader: (h) => String(h || '').trim(),
  });

  if (!result.meta || !result.meta.fields || result.meta.fields.length === 0) {
    throw new Error('NO_READABLE_RECORDS');
  }

  let headers = result.meta.fields.filter((h) => h && h.length > 0);
  if (headers.length === 0) {
    throw new Error('NO_READABLE_RECORDS');
  }
  const truncatedColumns = headers.length > MAX_COLUMNS;
  headers = headers.slice(0, MAX_COLUMNS);

  const totalRowsSeen = result.data.length;
  const truncatedRows = totalRowsSeen > MAX_ROWS;
  const limitedRows = result.data.slice(0, MAX_ROWS);

  const rows = limitedRows.map((row) => {
    const clean = {};
    headers.forEach((h) => {
      clean[h] = row[h] === undefined ? null : row[h];
    });
    return clean;
  });

  if (rows.length === 0) {
    throw new Error('NO_READABLE_RECORDS');
  }

  return {
    headers,
    rows,
    truncated: truncatedRows || truncatedColumns,
    totalRowsSeen,
  };
}

module.exports = { parseCsvBuffer };
