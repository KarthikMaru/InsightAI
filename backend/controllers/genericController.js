// File path: backend/controllers/genericController.js
// Purpose: Powers the general-purpose dataset features that don't assume
// a sales schema — the profile view, the dynamic Data Explorer table,
// and dynamic analytics/chart suggestions. Works for any dataset stored
// via the generic pipeline (services/genericIngestionService.js); it
// does not read sales_records at all.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const verifyDatasetAccess = require('../utils/verifyDatasetAccess');
const genericDatasetModel = require('../models/genericDatasetModel');
const genericAnalyticsService = require('../services/genericAnalyticsService');
const exportService = require('../services/exportService');
const { escapeCsvCell } = require('../utils/csvSafety');

async function loadProfile(datasetId) {
  const profile = await genericDatasetModel.getProfile(datasetId);
  if (!profile) {
    throw new ApiError(404, 'No profile found for this dataset. Try re-uploading it.');
  }
  return profile;
}

// @route   GET /api/datasets/:id/profile
// @access  Private
const getProfile = asyncHandler(async (req, res) => {
  const dataset = await verifyDatasetAccess(req.user, req.params.id);
  const profile = await loadProfile(dataset.id);
  res.json({ success: true, dataset, profile });
});

// @route   GET /api/datasets/:id/generic-records
// @access  Private
const getGenericRecords = asyncHandler(async (req, res) => {
  const dataset = await verifyDatasetAccess(req.user, req.params.id);
  const profile = await loadProfile(dataset.id);

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const sortColumn = req.query.sortBy || null;
  const sortColumnMeta = sortColumn ? profile.columns.find((c) => c.name === sortColumn) : null;
  const sortIsNumeric = sortColumnMeta ? ['integer', 'float'].includes(sortColumnMeta.inferredType) : false;

  const { total, records } = await genericDatasetModel.getPagedRows(dataset.id, {
    page,
    pageSize,
    search: req.query.search || null,
    sortColumn: sortColumnMeta ? sortColumn : null,
    sortDir: req.query.sortDir === 'asc' ? 'asc' : 'desc',
    sortIsNumeric,
    filterColumn: req.query.filterColumn || null,
    filterValue: req.query.filterValue || null,
  });

  res.json({
    success: true,
    columns: profile.columns.map((c) => ({ name: c.name, inferredType: c.inferredType })),
    records,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

// @route   GET /api/datasets/:id/generic-records/export
// @access  Private
const exportGenericRecords = asyncHandler(async (req, res) => {
  const dataset = await verifyDatasetAccess(req.user, req.params.id);
  const profile = await loadProfile(dataset.id);

  const { records } = await genericDatasetModel.getPagedRows(dataset.id, {
    page: 1,
    pageSize: 20000,
    search: req.query.search || null,
    filterColumn: req.query.filterColumn || null,
    filterValue: req.query.filterValue || null,
  });

  const headers = profile.columns.map((c) => c.name);
  const csvRows = records.map((r) => headers.map((h) => escapeCsvCell(r[h])).join(','));
  const csv = [headers.map(escapeCsvCell).join(','), ...csvRows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${dataset.name.replace(/\s+/g, '_')}_export.csv"`);
  res.send(csv);
});

// @route   GET /api/datasets/:id/generic-analytics
// @access  Private
const getGenericAnalytics = asyncHandler(async (req, res) => {
  const dataset = await verifyDatasetAccess(req.user, req.params.id);
  const profile = await loadProfile(dataset.id);
  const rows = await genericDatasetModel.getAllRows(dataset.id);

  const summary = genericAnalyticsService.buildFullSummary(profile, rows);
  res.json({ success: true, profile, summary });
});

// @route   GET /api/datasets/:id/export?format=csv|json|xlsx|sql|xml
// @access  Private
// Always exports the CURRENT saved state of the dataset — there is no
// separate snapshot, so this reflects every row/column edit made so far.
const exportDataset = asyncHandler(async (req, res) => {
  const dataset = await verifyDatasetAccess(req.user, req.params.id);
  const profile = await loadProfile(dataset.id);
  const format = (req.query.format || 'csv').toLowerCase();

  const headers = profile.columns.map((c) => c.name);
  const records = await genericDatasetModel.getAllRows(dataset.id);
  const safeName = dataset.name.replace(/[^a-zA-Z0-9_-]+/g, '_');

  if (format === 'json') {
    res.setHeader('Content-Type', exportService.CONTENT_TYPES.json);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.json"`);
    return res.send(exportService.toJSON(records));
  }
  if (format === 'xlsx') {
    const buffer = exportService.toExcelBuffer(headers, records);
    res.setHeader('Content-Type', exportService.CONTENT_TYPES.xlsx);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
    return res.send(buffer);
  }
  if (format === 'sql') {
    res.setHeader('Content-Type', exportService.CONTENT_TYPES.sql);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.sql"`);
    return res.send(exportService.toSQL(dataset.name, profile.columns, records));
  }
  if (format === 'xml') {
    res.setHeader('Content-Type', exportService.CONTENT_TYPES.xml);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xml"`);
    return res.send(exportService.toXML(headers, records));
  }

  // Default: csv
  res.setHeader('Content-Type', exportService.CONTENT_TYPES.csv);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
  res.send(exportService.toCSV(headers, records));
});

module.exports = { getProfile, getGenericRecords, exportGenericRecords, getGenericAnalytics, exportDataset };
