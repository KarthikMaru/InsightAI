// File path: backend/utils/csvSafety.js
// Purpose: Shared CSV cell escaping for every place the app exports data
// as CSV (legacy sales export + the new generic Data Explorer export).
// Guards against CSV formula injection: a cell whose text starts with
// =, +, -, or @ is interpreted as a formula by Excel/Sheets when the
// file is opened, which can be abused (e.g. =HYPERLINK(...) or
// =cmd|'/c calc'!A1) to run code or exfiltrate data on the recipient's
// machine. Prefixing such cells with a leading apostrophe/tab neutralizes
// them while keeping the visible value intact.

const FORMULA_TRIGGER_CHARS = ['=', '+', '-', '@', '\t', '\r'];

function escapeCsvCell(value) {
  let str = value === null || value === undefined ? '' : String(value);

  if (str.length > 0 && FORMULA_TRIGGER_CHARS.includes(str[0])) {
    str = `'${str}`;
  }

  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

module.exports = { escapeCsvCell };
