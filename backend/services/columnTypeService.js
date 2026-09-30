// File path: backend/services/columnTypeService.js
// Purpose: Backs the Dataset Editor's column type system. The editor
// exposes exactly six data types to the user (Text, Integer, Decimal,
// Boolean, Date, DateTime) — this maps those to the internal inferred
// types used elsewhere (services/typeInference.js adds 'categorical'
// and 'identifier', which are auto-detection-only classifications the
// user can't assign directly), validates individual cell values against
// a column's type, and implements the "preview before you convert"
// safety flow required whenever a column's type is changed: never
// silently drop data — always tell the caller what WOULD be lost first.

const { isBooleanLike, isIntegerLike, isNumericLike, isDateLike, isBlank } = require('./typeInference');
const { toNumber, toDate, toBoolean } = require('./valueCoercion');

// Editor label -> internal inferredType stored in dataset_columns.
const EDITOR_TYPE_TO_INTERNAL = {
  Text: 'text',
  Integer: 'integer',
  Decimal: 'float',
  Boolean: 'boolean',
  Date: 'date',
  DateTime: 'datetime',
};

// Internal inferredType -> editor label (for display; 'categorical' and
// 'identifier' are shown but not selectable as a *target* type).
const INTERNAL_TYPE_TO_LABEL = {
  text: 'Text',
  integer: 'Integer',
  float: 'Decimal',
  boolean: 'Boolean',
  date: 'Date',
  datetime: 'DateTime',
  categorical: 'Categorical',
  identifier: 'Identifier',
};

const EDITABLE_TYPES = Object.keys(EDITOR_TYPE_TO_INTERNAL); // the 6 the user can pick

function toInternalType(editorType) {
  return EDITOR_TYPE_TO_INTERNAL[editorType] || null;
}

function toLabel(internalType) {
  return INTERNAL_TYPE_TO_LABEL[internalType] || 'Text';
}

// Is `value` acceptable for `internalType`? Blank/null is always valid
// (it just means "no value"), matching normal spreadsheet semantics.
function isValidForType(value, internalType) {
  if (isBlank(value)) return true;
  switch (internalType) {
    case 'integer':
      return isIntegerLike(value);
    case 'float':
      return isNumericLike(value);
    case 'boolean':
      return isBooleanLike(value);
    case 'date':
    case 'datetime':
      return isDateLike(value);
    case 'text':
    case 'categorical':
    case 'identifier':
    default:
      return true;
  }
}

// Converts a raw value to the canonical stored form for `internalType`.
// Returns { ok: true, value } or { ok: false } if the value can't be
// represented in the target type (caller decides what to do — reject
// the edit, or null the cell out during a bulk column type change).
function coerceForType(value, internalType) {
  if (isBlank(value)) return { ok: true, value: null };
  switch (internalType) {
    case 'integer': {
      if (!isIntegerLike(value)) return { ok: false };
      return { ok: true, value: Math.trunc(toNumber(value)) };
    }
    case 'float': {
      if (!isNumericLike(value)) return { ok: false };
      return { ok: true, value: toNumber(value) };
    }
    case 'boolean': {
      const b = toBoolean(value);
      return b === null ? { ok: false } : { ok: true, value: b };
    }
    case 'date':
    case 'datetime': {
      const d = toDate(value);
      return d === null ? { ok: false } : { ok: true, value: d.toISOString() };
    }
    case 'text':
    case 'categorical':
    case 'identifier':
    default:
      return { ok: true, value: String(value) };
  }
}

/**
 * Validates an entire row's proposed values against the dataset's
 * current column types (used by Add Row / Edit Row). Returns
 * { valid, errors, coercedValues } — errors are user-facing messages
 * matching the app's "Column 'age' contains a value that cannot be
 * converted to Integer." style, and coercedValues has every field
 * normalized to its canonical stored form for values that DID validate.
 */
function validateRowAgainstColumns(values, columns) {
  const errors = [];
  const coercedValues = {};

  columns.forEach((col) => {
    const raw = Object.prototype.hasOwnProperty.call(values, col.name) ? values[col.name] : null;
    const result = coerceForType(raw, col.inferredType);
    if (!result.ok) {
      errors.push(`Column '${col.name}' contains a value that cannot be converted to ${toLabel(col.inferredType)}.`);
      coercedValues[col.name] = raw; // keep the raw value; caller rejects the whole row anyway
    } else {
      coercedValues[col.name] = result.value;
    }
  });

  return { valid: errors.length === 0, errors, coercedValues };
}

const PREVIEW_SAMPLE_SIZE = 10;

/**
 * Dry-runs a column type change across every row WITHOUT persisting
 * anything, so the UI can show "12 of 500 values can't be converted to
 * Integer and will be cleared" before the user confirms.
 */
function previewTypeConversion(rowsWithIds, columnName, newInternalType) {
  let wouldFailCount = 0;
  const sampleFailures = [];

  rowsWithIds.forEach(({ id, data }) => {
    const raw = data[columnName];
    if (isBlank(raw)) return;
    if (!isValidForType(raw, newInternalType)) {
      wouldFailCount += 1;
      if (sampleFailures.length < PREVIEW_SAMPLE_SIZE) {
        sampleFailures.push({ rowId: id, value: raw });
      }
    }
  });

  return {
    columnName,
    newType: toLabel(newInternalType),
    totalRows: rowsWithIds.length,
    wouldFailCount,
    sampleFailures,
    safe: wouldFailCount === 0,
  };
}

module.exports = {
  EDITABLE_TYPES,
  toInternalType,
  toLabel,
  isValidForType,
  coerceForType,
  validateRowAgainstColumns,
  previewTypeConversion,
};
