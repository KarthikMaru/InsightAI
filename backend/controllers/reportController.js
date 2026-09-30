// File path: backend/controllers/reportController.js
// Purpose: Generates PDF reports from real analytics data, lists a user's
// reports, and streams them back for download.

const path = require('path');
const fs = require('fs');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { query } = require('../config/db');
const verifyDatasetAccess = require('../utils/verifyDatasetAccess');
const reportService = require('../services/reportService');
const reportModel = require('../models/reportModel');

// @route   POST /api/reports/generate
// @access  Private
// body: { datasetId, reportType: 'monthly_sales' | 'product_performance' | 'regional' | 'customer' }
const generateReport = asyncHandler(async (req, res) => {
  const { datasetId, reportType } = req.body;

  if (!reportService.VALID_TYPES.includes(reportType)) {
    throw new ApiError(400, `Invalid report type. Must be one of: ${reportService.VALID_TYPES.join(', ')}`);
  }

  const dataset = await verifyDatasetAccess(req.user, datasetId);

  if (dataset.dataset_type !== 'sales') {
    throw new ApiError(
      400,
      'PDF reports are available for sales-shaped datasets only in this version. Use the Dashboard, Data Explorer, or AI Assistant to analyze this dataset instead.'
    );
  }

  const { fileName } = await reportService.generatePdf({ dataset, reportType });

  const report = await reportModel.create({
    userId: req.user.id,
    datasetId: dataset.id,
    reportType,
    filePath: fileName,
  });

  await query(
    `INSERT INTO activities (user_id, action, metadata) VALUES (?, ?, ?)`,
    [req.user.id, 'report_generated', JSON.stringify({ reportId: report.id, reportType })]
  );

  res.status(201).json({ success: true, report });
});

// @route   GET /api/reports
// @access  Private
const listReports = asyncHandler(async (req, res) => {
  const reports = await reportModel.listByUser(req.user.id);
  res.json({ success: true, reports });
});

// @route   GET /api/reports/:id/download
// @access  Private (owner or admin)
const downloadReport = asyncHandler(async (req, res) => {
  const report = await reportModel.findById(req.params.id);
  if (!report) throw new ApiError(404, 'Report not found');

  if (report.user_id !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(403, 'You do not have permission to access this report');
  }

  const filePath = reportService.getFilePath(report.file_path);
  if (!fs.existsSync(filePath)) {
    throw new ApiError(404, 'Report file no longer exists');
  }

  res.download(filePath, `${report.report_type}_${report.id}.pdf`);
});

// @route   DELETE /api/reports/:id
// @access  Private (owner or admin)
const deleteReport = asyncHandler(async (req, res) => {
  const report = await reportModel.findById(req.params.id);
  if (!report) throw new ApiError(404, 'Report not found');

  if (report.user_id !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(403, 'You do not have permission to delete this report');
  }

  const filePath = reportService.getFilePath(report.file_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await reportModel.delete(report.id);
  res.json({ success: true, message: 'Report deleted' });
});

module.exports = { generateReport, listReports, downloadReport, deleteReport };
