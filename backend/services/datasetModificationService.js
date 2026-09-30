// File path: backend/services/datasetModificationService.js
// Purpose: The "AI-powered dataset modification" engine. The AI is only
// ever allowed to CLASSIFY a natural-language instruction into one of a
// small, fixed set of operation types below, with parameters — it never
// writes or executes code, and it never touches the database directly.
// Every operation is:
//   1. Structurally validated here (required fields, referenced columns
//      must actually exist, types must be compatible) — an operation
//      that fails validation is rejected with a clear message, never
//      silently attempted.
//   2. Turned into a PREVIEW (sample before/after rows, counts, warnings)
//      that the user reviews before anything is written.
//   3. Only applied to the database after the user explicitly confirms
//      (see controllers/aiModificationController.js), using the exact
//      same computed values that were shown in the preview — the apply
//      step never re-runs the AI or recomputes anything differently.

const ApiError = require('../utils/ApiError');
const { compileExpression, evaluateExpression } = require('./expressionEvaluator');
const { toNumber, toDate } = require('./valueCoercion');
const { coerceForType } = require('./columnTypeService');
const { MAX_ROWS } = require('../config/limits');

const OPERATION_TYPES = [
  'add_computed_column',
  'bucket_column',
  'normalize_text',
  'fill_missing',
  'convert_date_format',
  'generate_synthetic_rows',
];

// Embedded directly in the AI classification prompt (geminiService.js)
// so the schema Gemini is asked to follow lives in exactly one place.
const OPERATION_SCHEMA_DESCRIPTION = `
Respond with ONLY one JSON object (no markdown fences, no commentary) matching exactly one of these shapes,
using EXISTING column names from the schema verbatim (never invent a column name that isn't listed):

1. Add a calculated numeric column from a formula (e.g. "profit_margin = profit/revenue*100"):
{ "operation": "add_computed_column", "newColumnName": "profit_margin", "dataType": "Decimal", "expression": "profit / revenue * 100" }
(expression may only use existing numeric column names, +, -, *, /, parentheses, and numbers — nothing else)

2. Add a categorical column by bucketing a numeric column into ranges (e.g. "age_group" from "age"):
{ "operation": "bucket_column", "sourceColumn": "age", "newColumnName": "age_group", "buckets": [{"max": 18, "label": "Minor"}, {"max": 35, "label": "Young Adult"}, {"max": 55, "label": "Adult"}, {"max": null, "label": "Senior"}] }
(buckets sorted ascending by "max"; the last bucket's "max" must be null meaning "and above")

3. Normalize a text column's formatting (e.g. "normalize department names"):
{ "operation": "normalize_text", "columnName": "department", "mode": "trim_titlecase" }
(mode is one of: trim_titlecase, uppercase, lowercase, trim_only)

4. Fill missing values in a column:
{ "operation": "fill_missing", "columnName": "salary", "strategy": "median" }
(strategy is one of: median, mean, mode, constant — for constant, also include "constantValue")

5. Normalize a date column's formatting to ISO (YYYY-MM-DD):
{ "operation": "convert_date_format", "columnName": "joining_date" }

6. Generate additional synthetic rows similar to the existing data:
{ "operation": "generate_synthetic_rows", "count": 50 }

If the instruction doesn't clearly match any of these, respond with:
{ "operation": "unsupported", "reason": "short explanation" }
`.trim();

function getColumn(profile, name) {
  return profile.columns.find((c) => c.name === name);
}

function requireColumn(profile, name, label = 'column') {
  const col = getColumn(profile, name);
  if (!col) throw new ApiError(400, `The AI referenced a ${label} ('${name}') that doesn't exist in this dataset.`);
  return col;
}

// ---------------------------------------------------------------------
// Validation — structural checks only. Throws ApiError(400) with a
// specific, user-facing reason on anything malformed.
// ---------------------------------------------------------------------
function validateOperation(op, profile) {
  if (!op || typeof op !== 'object' || !OPERATION_TYPES.includes(op.operation)) {
    throw new ApiError(400, "I couldn't turn that into a supported dataset change. Try rephrasing, e.g. \"add a profit_margin column\" or \"fill missing salary values with the median\".");
  }

  switch (op.operation) {
    case 'add_computed_column': {
      if (!op.newColumnName || typeof op.newColumnName !== 'string') throw new ApiError(400, 'A new column name is required.');
      if (getColumn(profile, op.newColumnName)) throw new ApiError(400, `A column named '${op.newColumnName}' already exists.`);
      if (!['Integer', 'Decimal'].includes(op.dataType)) throw new ApiError(400, 'Computed columns must be Integer or Decimal.');
      if (!op.expression || typeof op.expression !== 'string') throw new ApiError(400, 'A formula is required for a computed column.');
      const { identifiers } = compileExpression(op.expression); // throws ApiError on bad syntax
      identifiers.forEach((id) => requireColumn(profile, id, 'column'));
      return;
    }
    case 'bucket_column': {
      requireColumn(profile, op.sourceColumn, 'source column');
      if (!op.newColumnName || getColumn(profile, op.newColumnName)) {
        throw new ApiError(400, `Provide a new, unused column name (got '${op.newColumnName}').`);
      }
      if (!Array.isArray(op.buckets) || op.buckets.length === 0) throw new ApiError(400, 'At least one bucket range is required.');
      const last = op.buckets[op.buckets.length - 1];
      if (last.max !== null) throw new ApiError(400, "The last bucket's max must be null (meaning \"and above\").");
      op.buckets.forEach((b, i) => {
        if (!b.label || typeof b.label !== 'string') throw new ApiError(400, `Bucket ${i + 1} needs a label.`);
        if (i < op.buckets.length - 1 && typeof b.max !== 'number') throw new ApiError(400, `Bucket ${i + 1} needs a numeric max.`);
      });
      return;
    }
    case 'normalize_text': {
      requireColumn(profile, op.columnName);
      if (!['trim_titlecase', 'uppercase', 'lowercase', 'trim_only'].includes(op.mode)) {
        throw new ApiError(400, 'Unsupported text normalization mode.');
      }
      return;
    }
    case 'fill_missing': {
      const col = requireColumn(profile, op.columnName);
      if (!['median', 'mean', 'mode', 'constant'].includes(op.strategy)) throw new ApiError(400, 'Unsupported fill strategy.');
      if ((op.strategy === 'median' || op.strategy === 'mean') && !['integer', 'float'].includes(col.inferredType)) {
        throw new ApiError(400, `'${op.columnName}' isn't numeric, so median/mean can't be used — try 'mode' or 'constant' instead.`);
      }
      if (op.strategy === 'constant' && (op.constantValue === undefined || op.constantValue === null || op.constantValue === '')) {
        throw new ApiError(400, 'A constant value is required for the "constant" fill strategy.');
      }
      return;
    }
    case 'convert_date_format': {
      const col = requireColumn(profile, op.columnName);
      if (!['date', 'datetime'].includes(col.inferredType)) {
        throw new ApiError(400, `'${op.columnName}' isn't a date column.`);
      }
      return;
    }
    case 'generate_synthetic_rows': {
      const count = parseInt(op.count, 10);
      if (!Number.isFinite(count) || count < 1 || count > 300) {
        throw new ApiError(400, 'Please request between 1 and 300 synthetic rows at a time.');
      }
      return;
    }
    case 'unsupported':
      throw new ApiError(400, op.reason || "I couldn't turn that into a supported dataset change.");
    default:
      throw new ApiError(400, 'Unsupported operation.');
  }
}

// ---------------------------------------------------------------------
// Preview — computes the FULL result (so apply never has to recompute
// or re-ask the AI), but only returns a small sample + summary for
// display. `rowsWithIds` is [{ id, data }].
// ---------------------------------------------------------------------
const SAMPLE_SIZE = 8;

function buildPreview(op, profile, rowsWithIds) {
  switch (op.operation) {
    case 'add_computed_column': {
      const { ast } = compileExpression(op.expression);
      let nullCount = 0;
      const computed = rowsWithIds.map(({ id, data }) => {
        const value = evaluateExpression(ast, data);
        if (value === null) nullCount++;
        return { id, value: op.dataType === 'Integer' && value !== null ? Math.round(value) : value };
      });
      const sample = rowsWithIds.slice(0, SAMPLE_SIZE).map((r, i) => ({ ...r.data, [op.newColumnName]: computed[i].value }));
      return {
        preview: {
          description: `Add column '${op.newColumnName}' (${op.dataType}) = ${op.expression}`,
          sampleRows: sample,
          affectedCount: rowsWithIds.length,
          warnings: nullCount > 0 ? [`${nullCount} of ${rowsWithIds.length} row(s) couldn't compute a value (missing or non-numeric inputs) and will be left blank.`] : [],
        },
        applyPlan: { type: 'add_column', newColumnName: op.newColumnName, dataType: op.dataType.toLowerCase() === 'integer' ? 'integer' : 'float', values: computed },
      };
    }
    case 'bucket_column': {
      const buckets = op.buckets;
      const labelFor = (v) => {
        const num = toNumber(v);
        if (num === null) return null;
        const match = buckets.find((b) => b.max === null || num <= b.max);
        return match ? match.label : null;
      };
      const computed = rowsWithIds.map(({ id, data }) => ({ id, value: labelFor(data[op.sourceColumn]) }));
      const sample = rowsWithIds.slice(0, SAMPLE_SIZE).map((r, i) => ({ ...r.data, [op.newColumnName]: computed[i].value }));
      const counts = {};
      computed.forEach((c) => { if (c.value) counts[c.value] = (counts[c.value] || 0) + 1; });
      return {
        preview: {
          description: `Add column '${op.newColumnName}' by bucketing '${op.sourceColumn}'`,
          sampleRows: sample,
          affectedCount: rowsWithIds.length,
          bucketCounts: counts,
          warnings: [],
        },
        applyPlan: { type: 'add_column', newColumnName: op.newColumnName, dataType: 'categorical', values: computed },
      };
    }
    case 'normalize_text': {
      const transform = (v) => {
        if (v === null || v === undefined) return v;
        const str = String(v).trim();
        if (op.mode === 'uppercase') return str.toUpperCase();
        if (op.mode === 'lowercase') return str.toLowerCase();
        if (op.mode === 'trim_titlecase') return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
        return str; // trim_only
      };
      let changedCount = 0;
      const computed = rowsWithIds.map(({ id, data }) => {
        const before = data[op.columnName];
        const after = transform(before);
        if (String(before ?? '') !== String(after ?? '')) changedCount++;
        return { id, value: after };
      });
      const changedSamples = rowsWithIds
        .map((r, i) => ({ before: r.data[op.columnName], after: computed[i].value }))
        .filter((p) => String(p.before ?? '') !== String(p.after ?? ''))
        .slice(0, SAMPLE_SIZE);
      return {
        preview: {
          description: `Normalize text in '${op.columnName}' (${op.mode})`,
          sampleChanges: changedSamples,
          affectedCount: changedCount,
          warnings: changedCount === 0 ? ["No values needed changing — they're already normalized."] : [],
        },
        applyPlan: { type: 'update_column', columnName: op.columnName, values: computed },
      };
    }
    case 'fill_missing': {
      const col = getColumn(profile, op.columnName);
      const existingValues = rowsWithIds.map((r) => r.data[op.columnName]).filter((v) => v !== null && v !== undefined && v !== '');
      let fillValue;
      if (op.strategy === 'constant') {
        const coerced = coerceForType(op.constantValue, col.inferredType);
        if (!coerced.ok) throw new ApiError(400, `'${op.constantValue}' isn't a valid value for column '${op.columnName}'.`);
        fillValue = coerced.value;
      } else if (op.strategy === 'mode') {
        const counts = new Map();
        existingValues.forEach((v) => counts.set(String(v), (counts.get(String(v)) || 0) + 1));
        fillValue = existingValues.length === 0 ? null : [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      } else {
        const nums = existingValues.map(toNumber).filter((n) => n !== null).sort((a, b) => a - b);
        if (nums.length === 0) throw new ApiError(400, `'${op.columnName}' has no existing values to compute a ${op.strategy} from.`);
        if (op.strategy === 'mean') {
          fillValue = Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4));
        } else {
          const mid = Math.floor(nums.length / 2);
          fillValue = nums.length % 2 === 0 ? Number(((nums[mid - 1] + nums[mid]) / 2).toFixed(4)) : nums[mid];
        }
      }

      let filledCount = 0;
      const computed = rowsWithIds.map(({ id, data }) => {
        const current = data[op.columnName];
        const isMissing = current === null || current === undefined || current === '';
        if (isMissing) filledCount++;
        return { id, value: isMissing ? fillValue : current };
      });
      return {
        preview: {
          description: `Fill missing values in '${op.columnName}' with ${op.strategy}${op.strategy === 'constant' ? '' : ` (${fillValue})`}`,
          fillValue,
          affectedCount: filledCount,
          warnings: filledCount === 0 ? ['No missing values found in this column.'] : [],
        },
        applyPlan: { type: 'update_column', columnName: op.columnName, values: computed },
      };
    }
    case 'convert_date_format': {
      let changedCount = 0;
      let unparseableCount = 0;
      const computed = rowsWithIds.map(({ id, data }) => {
        const raw = data[op.columnName];
        if (raw === null || raw === undefined || raw === '') return { id, value: raw };
        const d = toDate(raw);
        if (!d) { unparseableCount++; return { id, value: raw }; }
        const iso = d.toISOString().slice(0, 10);
        if (iso !== String(raw).slice(0, 10)) changedCount++;
        return { id, value: iso };
      });
      return {
        preview: {
          description: `Normalize '${op.columnName}' to YYYY-MM-DD`,
          affectedCount: changedCount,
          warnings: unparseableCount > 0 ? [`${unparseableCount} value(s) couldn't be parsed as dates and were left unchanged.`] : [],
        },
        applyPlan: { type: 'update_column', columnName: op.columnName, values: computed },
      };
    }
    default:
      throw new ApiError(400, 'This operation cannot be previewed.');
  }
}

// Builds the preview for generate_synthetic_rows once the AI has
// actually produced candidate rows (a separate step from buildPreview
// above, since this operation needs its own Gemini call — see
// controllers/aiModificationController.js). `candidateRows` are already
// validated/repaired plain row objects (via parseJsonBuffer + per-field
// coerceForType, exactly like Phase 4's dataset generation).
function buildSyntheticRowsPreview(count, candidateRows) {
  return {
    preview: {
      description: `Generate ${candidateRows.length} synthetic row(s) similar to the existing data`,
      sampleRows: candidateRows.slice(0, SAMPLE_SIZE),
      affectedCount: candidateRows.length,
      warnings: candidateRows.length < count ? [`Only ${candidateRows.length} of the ${count} requested rows were usable after validation.`] : [],
    },
    applyPlan: { type: 'insert_rows', rows: candidateRows },
  };
}

// ---------------------------------------------------------------------
// Apply — writes the EXACT values computed during preview. Runs inside
// the caller's transaction (see controllers/aiModificationController.js),
// paired with a reprofile, so it either fully commits or fully rolls
// back like every other mutation in the app.
// ---------------------------------------------------------------------
async function applyOperationPlan(client, datasetId, applyPlan) {
  const genericDatasetModel = require('../models/genericDatasetModel'); // lazy require avoids a require cycle with columnTypeService's consumers

  if (applyPlan.type === 'add_column') {
    const columns = await genericDatasetModel.getColumnsTx(client, datasetId);
    await genericDatasetModel.addColumnMeta(client, datasetId, {
      name: applyPlan.newColumnName,
      inferredType: applyPlan.dataType,
      position: columns.length,
    });
    await genericDatasetModel.applyColumnValues(client, datasetId, applyPlan.newColumnName, applyPlan.values);
    return;
  }

  if (applyPlan.type === 'update_column') {
    await genericDatasetModel.applyColumnValues(client, datasetId, applyPlan.columnName, applyPlan.values);
    return;
  }

  if (applyPlan.type === 'insert_rows') {
    const { rows: countRows } = await client.query('SELECT COUNT(*) AS total FROM dataset_rows WHERE dataset_id = ?', [datasetId]);
    const currentCount = countRows[0].total;
    const roomLeft = Math.max(0, MAX_ROWS - currentCount);
    const rowsToInsert = applyPlan.rows.slice(0, roomLeft);

    let nextIndex = (await genericDatasetModel.getMaxRowIndexTx(client, datasetId)) + 1;
    for (const row of rowsToInsert) {
      await genericDatasetModel.insertSingleRow(client, datasetId, nextIndex, row);
      nextIndex += 1;
    }
    return;
  }

  throw new ApiError(400, 'Unknown apply plan type.');
}

module.exports = { OPERATION_TYPES, OPERATION_SCHEMA_DESCRIPTION, validateOperation, buildPreview, buildSyntheticRowsPreview, applyOperationPlan };
