// File path: backend/controllers/aiModificationController.js
// Purpose: "AI-powered dataset modification" — propose → preview →
// confirm → apply. The AI never touches the database directly: propose
// asks it to classify a natural-language instruction into one of a
// fixed set of operations (services/datasetModificationService.js),
// computes the FULL result, and stores it server-side under a one-time
// token; apply only ever replays that exact stored result after the
// user explicitly confirms — it never re-runs the AI or recomputes
// anything differently from what was previewed.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const verifyDatasetAccess = require('../utils/verifyDatasetAccess');
const { getConnection } = require('../config/db');
const genericDatasetModel = require('../models/genericDatasetModel');
const geminiService = require('../services/geminiService');
const modificationService = require('../services/datasetModificationService');
const { coerceForType } = require('../services/columnTypeService');
const pendingProposalStore = require('../services/pendingProposalStore');
const { reprofileAndTouch } = require('../services/reprofileService');

async function loadEditableDataset(user, datasetId) {
  const dataset = await verifyDatasetAccess(user, datasetId);
  if (dataset.dataset_type === 'sales') {
    throw new ApiError(400, 'AI-powered modification is available for general-purpose datasets only in this version.');
  }
  return dataset;
}

function parseAiJson(rawText, invalidMessage) {
  try {
    const cleaned = rawText.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    throw new ApiError(502, invalidMessage);
  }
}

// @route   POST /api/datasets/:id/ai-modify/propose
// @access  Private
// Body: { instruction: "add a profit_margin column" }
const proposeModification = asyncHandler(async (req, res) => {
  const { instruction } = req.body;
  if (!instruction || !instruction.trim()) {
    throw new ApiError(400, 'Describe the change you want, e.g. "fill missing salary values with the median".');
  }

  const dataset = await loadEditableDataset(req.user, req.params.id);
  const profile = await genericDatasetModel.getProfile(dataset.id);
  if (!profile) throw new ApiError(404, 'No profile found for this dataset. Try re-uploading it.');

  const rawClassification = await geminiService.proposeDatasetModification({ instruction: instruction.trim(), profile });
  const op = parseAiJson(rawClassification, "I couldn't understand that request. Please try rephrasing it.");
  modificationService.validateOperation(op, profile); // throws ApiError(400) with a specific reason on anything invalid

  let previewResult;
  if (op.operation === 'generate_synthetic_rows') {
    const sampleRows = (await genericDatasetModel.getAllRows(dataset.id)).slice(0, 10);
    const rawRows = await geminiService.generateSyntheticRows({ profile, sampleRows, count: op.count });
    const parsedRows = parseAiJson(rawRows, 'The AI could not generate usable rows. Please try again.');

    const rowsArray = Array.isArray(parsedRows?.rows) ? parsedRows.rows : Array.isArray(parsedRows) ? parsedRows : null;
    if (!rowsArray || rowsArray.length === 0) {
      throw new ApiError(502, 'The AI did not return any usable rows. Please try again.');
    }

    // Never trust the AI's values directly: coerce every field to its
    // column's DECLARED type (same "repair, don't reject" pattern as
    // Phase 4's dataset generation) — invalid values become null rather
    // than corrupting the column or crashing the request.
    const candidateRows = rowsArray.slice(0, op.count).map((row) => {
      const clean = {};
      profile.columns.forEach((col) => {
        const result = coerceForType(row?.[col.name], col.inferredType);
        clean[col.name] = result.ok ? result.value : null;
      });
      return clean;
    });

    previewResult = modificationService.buildSyntheticRowsPreview(op.count, candidateRows);
  } else {
    const rowsWithIds = await genericDatasetModel.getAllRowsWithIds(dataset.id);
    previewResult = modificationService.buildPreview(op, profile, rowsWithIds);
  }

  const token = pendingProposalStore.create({
    userId: req.user.id,
    datasetId: dataset.id,
    operation: op,
    preview: previewResult.preview,
    applyPlan: previewResult.applyPlan,
  });

  res.json({ success: true, token, operation: op, preview: previewResult.preview });
});

// @route   POST /api/datasets/:id/ai-modify/apply
// @access  Private
// Body: { token }
const applyModification = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) throw new ApiError(400, 'Missing proposal token.');

  const dataset = await loadEditableDataset(req.user, req.params.id);
  const proposal = pendingProposalStore.get(token, req.user.id, dataset.id);
  if (!proposal) {
    throw new ApiError(410, 'This proposal has expired or was already applied. Please ask again.');
  }

  const client = await getConnection();
  try {
    await client.beginTransaction();
    await modificationService.applyOperationPlan(client, dataset.id, proposal.applyPlan);
    const profile = await reprofileAndTouch(client, dataset.id);
    await client.commit();
    pendingProposalStore.discard(token);

    res.json({ success: true, appliedOperation: proposal.operation, profile });
  } catch (err) {
    await client.rollback();
    throw err;
  } finally {
    client.release();
  }
});

// @route   DELETE /api/datasets/:id/ai-modify/:token
// @access  Private
const cancelModification = asyncHandler(async (req, res) => {
  await loadEditableDataset(req.user, req.params.id); // ownership check
  pendingProposalStore.discard(req.params.token);
  res.json({ success: true });
});

module.exports = { proposeModification, applyModification, cancelModification };
