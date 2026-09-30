// File path: backend/controllers/adminController.js
// Purpose: Platform-wide visibility for admins — user/dataset counts,
// records processed, recent activity, and the ability to inspect or
// remove datasets/users across all businesses. Every route here is
// additionally gated by `authorize('admin')` in adminRoutes.js.

const asyncHandler = require('../utils/asyncHandler');
const { query } = require('../config/db');
const userModel = require('../models/userModel');
const datasetModel = require('../models/datasetModel');
const aiQueryModel = require('../models/aiQueryModel');
const reportModel = require('../models/reportModel');

// @route   GET /api/admin/stats
// @access  Private/Admin
const getStats = asyncHandler(async (req, res) => {
  const [totalUsers, totalDatasets, totalAiQueries, totalReports, rowCountResult] = await Promise.all([
    userModel.countAll(),
    datasetModel.countAll(),
    aiQueryModel.countAll(),
    reportModel.countAll(),
    query(`SELECT COALESCE(SUM(row_count), 0) AS total FROM datasets WHERE status = 'ready'`),
  ]);

  res.json({
    success: true,
    stats: {
      totalUsers,
      totalDatasets,
      totalRecordsProcessed: Number(rowCountResult.rows[0].total),
      totalAiQueries,
      totalReports,
    },
  });
});

// @route   GET /api/admin/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const users = await userModel.listAll({ limit, offset: (page - 1) * limit });
  res.json({ success: true, users });
});

// @route   GET /api/admin/datasets
// @access  Private/Admin
const getDatasets = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const datasets = await datasetModel.listAllForAdmin({ limit, offset: (page - 1) * limit });
  res.json({ success: true, datasets });
});

// @route   GET /api/admin/activities
// @access  Private/Admin
const getActivities = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.action, a.metadata, a.created_at, u.name AS user_name, u.email AS user_email
     FROM activities a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC
     LIMIT 50`
  );
  res.json({ success: true, activities: rows });
});

module.exports = { getStats, getUsers, getDatasets, getActivities };
