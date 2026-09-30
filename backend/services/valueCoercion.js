// File path: backend/services/valueCoercion.js
// Purpose: Converts a raw cell value (string/number/whatever a parser
// produced) into the JS type implied by its column's inferred type, so
// downstream statistics (sum, mean, correlation, date trends, etc.) work
// on real numbers/Dates rather than strings.

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).trim().replace(/[$,%\s]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim();
  let d = new Date(str);
  if (isNaN(d.getTime())) {
    const parts = str.split(/[/-]/);
    if (parts.length === 3) {
      const [a, b, c] = parts.map(Number);
      d = new Date(c < 100 ? 2000 + c : c, a - 1, b);
    }
  }
  return isNaN(d.getTime()) ? null : d;
}

function toBoolean(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(str)) return true;
  if (['false', 'no', 'n', '0'].includes(str)) return false;
  return null;
}

function coerceByType(value, inferredType) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  switch (inferredType) {
    case 'integer':
    case 'float':
      return toNumber(value);
    case 'date':
    case 'datetime':
      return toDate(value);
    case 'boolean':
      return toBoolean(value);
    default:
      return String(value);
  }
}

module.exports = { toNumber, toDate, toBoolean, coerceByType };
