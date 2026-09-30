// File path: backend/controllers/aiController.js
// Purpose: The AI layer's HTTP surface. Every endpoint follows the same
// contract: retrieve real data from SQL first, then hand that data (never
// raw DB access) to Gemini. Text-to-SQL is the one path that lets the
// model propose its own query, and that proposal is always validated and
// re-scoped before it ever touches the database.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { query } = require('../config/db');
const verifyDatasetAccess = require('../utils/verifyDatasetAccess');
const analyticsService = require('../services/analyticsService');
const genericDatasetModel = require('../models/genericDatasetModel');
const genericAnalyticsService = require('../services/genericAnalyticsService');
const geminiService = require('../services/geminiService');
const { validateSelectOnlySql, scopeQueryToDataset } = require('../services/sqlValidator');
const aiQueryModel = require('../models/aiQueryModel');
const aiInsightModel = require('../models/aiInsightModel');

// Loads the grounding data for a dataset regardless of whether it's a
// legacy Superstore-shaped dataset (SQL analytics over sales_records) or
// a general-purpose one (in-memory stats over its profiled rows), so the
// AI is always answering from real, retrieved data — never inventing.
async function loadGroundingData(dataset) {
  if (dataset.dataset_type === 'sales') {
    const dataBundle = await analyticsService.getFullSummary(dataset.id);
    return { kind: 'sales', dataBundle };
  }

  const profile = await genericDatasetModel.getProfile(dataset.id);
  if (!profile) {
    throw new ApiError(404, 'No profile found for this dataset. Try re-uploading it.');
  }
  const rows = await genericDatasetModel.getAllRows(dataset.id);
  const summary = genericAnalyticsService.buildFullSummary(profile, rows);
  return { kind: 'generic', profile, summary };
}

// @route   POST /api/ai/chat
// @access  Private
// Architecture: question -> retrieve real analytics data for the dataset
// -> send (question + data) to Gemini -> return grounded answer.
const chat = asyncHandler(async (req, res) => {
  const { datasetId, question } = req.body;
  if (!question || !question.trim()) {
    throw new ApiError(400, 'A question is required');
  }
  const dataset = await verifyDatasetAccess(req.user, datasetId);

  const grounding = await loadGroundingData(dataset);
  const answer =
    grounding.kind === 'sales'
      ? await geminiService.generateBusinessInsight({ question, dataBundle: grounding.dataBundle })
      : await geminiService.generateGenericBusinessInsight({
          question,
          profile: grounding.profile,
          summary: grounding.summary,
        });

  await aiQueryModel.create({
    userId: req.user.id,
    datasetId: dataset.id,
    question,
    generatedSql: null,
    resultSummary: grounding.kind === 'sales' ? { kpis: grounding.dataBundle.kpis } : { rowCount: grounding.summary.rowCount },
    aiResponse: answer,
  });

  res.json({ success: true, question, answer });
});

// @route   POST /api/ai/generate-insights
// @access  Private
// Generates and caches categorized automated insights for a dataset.
const generateInsights = asyncHandler(async (req, res) => {
  const { datasetId } = req.body;
  const dataset = await verifyDatasetAccess(req.user, datasetId);

  const grounding = await loadGroundingData(dataset);
  const insights =
    grounding.kind === 'sales'
      ? await geminiService.generateAutomatedInsights({ summary: grounding.dataBundle })
      : await geminiService.generateGenericAutomatedInsights({ profile: grounding.profile, summary: grounding.summary });
  const saved = await aiInsightModel.replaceForDataset(dataset.id, insights);

  await query(
    `INSERT INTO activities (user_id, action, metadata) VALUES (?, ?, ?)`,
    [req.user.id, 'ai_insights_generated', JSON.stringify({ datasetId: dataset.id, count: saved.length })]
  );

  res.json({ success: true, insights: saved });
});

// @route   GET /api/ai/insights?datasetId=
// @access  Private
// Returns cached insights (does not call Gemini) — use generate-insights
// to refresh. Also reports whether the dataset has been edited (rows/
// columns/cells) SINCE these insights were generated, by comparing
// datasets.updated_at (bumped on every mutation — see
// services/reprofileService.js) against the insights' own timestamp.
// Without this check, a user who edits a dataset after generating
// insights would silently see stale, pre-edit conclusions with no
// indication anything was out of date.
const getCachedInsights = asyncHandler(async (req, res) => {
  const dataset = await verifyDatasetAccess(req.user, req.query.datasetId);
  const insights = await aiInsightModel.findByDataset(dataset.id);

  const isStale = Boolean(
    insights.length > 0 &&
    dataset.updated_at &&
    new Date(dataset.updated_at).getTime() > new Date(insights[0].created_at).getTime()
  );

  res.json({ success: true, insights, isStale, datasetUpdatedAt: dataset.updated_at });
});

// @route   POST /api/ai/text-to-sql
// @access  Private
// Architecture: question -> Gemini proposes SQL -> validate (SELECT-only,
// whitelisted tables, no multiple statements/comments/DDL) -> wrap in a
// dataset-scoping CTE -> execute -> Gemini explains the actual result.
const textToSql = asyncHandler(async (req, res) => {
  const { datasetId, question } = req.body;
  if (!question || !question.trim()) {
    throw new ApiError(400, 'A question is required');
  }
  const dataset = await verifyDatasetAccess(req.user, datasetId);

  if (dataset.dataset_type !== 'sales') {
    throw new ApiError(
      400,
      "Natural-language-to-SQL is available for sales-shaped datasets only in this version. Use \"Ask a question\" mode instead — it works with any dataset."
    );
  }

  const rawSql = await geminiService.generateSqlFromQuestion({ question });
  const validation = validateSelectOnlySql(rawSql);

  if (!validation.valid) {
    await aiQueryModel.create({
      userId: req.user.id,
      datasetId: dataset.id,
      question,
      generatedSql: rawSql,
      resultSummary: { rejected: true, errors: validation.errors },
      aiResponse: null,
    });
    throw new ApiError(400, `The generated query failed safety validation: ${validation.errors.join('; ')}`);
  }

  const { sql: scopedSql, params } = scopeQueryToDataset(validation.cleanedSql, dataset.id);

  let result;
  try {
    result = await query(scopedSql, params);
  } catch (err) {
    await aiQueryModel.create({
      userId: req.user.id,
      datasetId: dataset.id,
      question,
      generatedSql: validation.cleanedSql,
      resultSummary: { executionError: true },
      aiResponse: null,
    });
    throw new ApiError(400, 'The generated query could not be executed against your data. Try rephrasing the question.');
  }

  const explanation = await geminiService.explainQueryResult({
    question,
    sql: validation.cleanedSql,
    resultRows: result.rows,
  });

  await aiQueryModel.create({
    userId: req.user.id,
    datasetId: dataset.id,
    question,
    generatedSql: validation.cleanedSql,
    resultSummary: { rowCount: result.rows.length },
    aiResponse: explanation,
  });

  res.json({
    success: true,
    question,
    generatedSql: validation.cleanedSql,
    result: result.rows,
    explanation,
  });
});

// @route   GET /api/ai/history?datasetId=
// @access  Private
const getHistory = asyncHandler(async (req, res) => {
  const dataset = await verifyDatasetAccess(req.user, req.query.datasetId);
  const history = await aiQueryModel.listByDataset(dataset.id, { limit: 20 });
  res.json({ success: true, history });
});

module.exports = { chat, generateInsights, getCachedInsights, textToSql, getHistory };
