// File path: backend/services/parsers/excelParser.js
// Purpose: Parses an uploaded .xlsx/.xls buffer into { headers, rows }
// using SheetJS (xlsx). Uses the first sheet that actually contains data
// (skips genuinely empty sheets, e.g. a blank "Notes" tab before "Data").

const XLSX = require('xlsx');
const { MAX_ROWS, MAX_COLUMNS } = require('../../config/limits');

function parseExcelBuffer(buffer) {
  let workbook;
  try {
    // cellDates: true so date-formatted cells come back as JS Dates
    // rather than Excel's serial-number encoding.
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw new Error('UNABLE_TO_PARSE');
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('NO_READABLE_RECORDS');
  }

  let sheetJson = null;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
    if (json.length > 0) {
      sheetJson = json;
      break;
    }
  }

  if (!sheetJson || sheetJson.length === 0) {
    throw new Error('NO_READABLE_RECORDS');
  }

  const totalRowsSeen = sheetJson.length;
  const truncatedRows = totalRowsSeen > MAX_ROWS;
  const limited = sheetJson.slice(0, MAX_ROWS);

  const headerSet = new Set();
  limited.slice(0, 500).forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
  let headers = [...headerSet];
  const truncatedColumns = headers.length > MAX_COLUMNS;
  headers = headers.slice(0, MAX_COLUMNS);

  if (headers.length === 0) {
    throw new Error('NO_READABLE_RECORDS');
  }

  const rows = limited.map((r) => {
    const clean = {};
    headers.forEach((h) => {
      const v = r[h];
      clean[h] = v instanceof Date ? v.toISOString() : v === undefined ? null : v;
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

module.exports = { parseExcelBuffer };
