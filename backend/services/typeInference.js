// File path: backend/services/typeInference.js
// Purpose: Infers a data type for a single column from a sample of its
// values, with no assumptions about what the column represents. This is
// the core of the "no hardcoded schema" requirement — every dataset,
// regardless of its actual subject matter, goes through the same
// inference rules.

const BOOLEAN_VALUES = new Set(['true', 'false', 'yes', 'no', 'y', 'n', '1', '0']);
const DATE_REGEXES = [
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/, // ISO
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // MM/DD/YYYY or DD/MM/YYYY
  /^\d{1,2}-\d{1,2}-\d{2,4}$/,
  /^\d{4}\/\d{1,2}\/\d{1,2}$/,
];

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

function isBooleanLike(v) {
  return BOOLEAN_VALUES.has(String(v).trim().toLowerCase());
}

function isNumericLike(v) {
  if (typeof v === 'number') return Number.isFinite(v);
  const cleaned = String(v).trim().replace(/[$,%\s]/g, '');
  if (cleaned === '' || cleaned === '-') return false;
  return /^-?\d+(\.\d+)?$/.test(cleaned);
}

function isIntegerLike(v) {
  const cleaned = String(v).trim().replace(/[$,%\s]/g, '');
  return /^-?\d+$/.test(cleaned);
}

function isDateLike(v) {
  const str = String(v).trim();
  if (str === '') return false;
  if (DATE_REGEXES.some((re) => re.test(str))) return true;
  // Reject bare numbers / booleans being misread as dates by Date.parse.
  if (isNumericLike(str) || isBooleanLike(str)) return false;
  const parsed = Date.parse(str);
  return !Number.isNaN(parsed) && str.length >= 6;
}

/**
 * Infers a type for a column given its name and a sample of raw values
 * (nulls/blanks already excluded by the caller).
 * @returns {'identifier'|'boolean'|'date'|'integer'|'float'|'categorical'|'text'}
 */
function inferColumnType({ columnName, sampleValues, uniqueCount, totalNonBlank }) {
  if (totalNonBlank === 0) return 'text';

  const ratio = (fn) => sampleValues.filter(fn).length / sampleValues.length;
  const uniqueRatio = uniqueCount / totalNonBlank;

  const looksLikeIdName = /(^id$|_id$|^uuid$|^guid$|identifier)/i.test(columnName);

  if (ratio(isBooleanLike) >= 0.95 && uniqueCount <= 2) return 'boolean';

  if (ratio(isDateLike) >= 0.85) return 'date';

  if (ratio(isNumericLike) >= 0.9) {
    if (looksLikeIdName && uniqueRatio > 0.9) return 'identifier';
    return ratio(isIntegerLike) >= 0.95 ? 'integer' : 'float';
  }

  if (looksLikeIdName && uniqueRatio > 0.9) return 'identifier';

  // High-cardinality free text vs. a reusable category label.
  if (uniqueRatio > 0.6 && uniqueCount > 30) return 'text';

  return 'categorical';
}

module.exports = { inferColumnType, isBlank, isBooleanLike, isNumericLike, isIntegerLike, isDateLike };
