// File path: backend/controllers/analyticsController.js
// Purpose: Exposes the SQL analytics engine over REST. Every endpoint
// requires a datasetId and verifies the requesting user owns it (or is
// an admin) before running any query. Optional filters: startDate,
// endDate, category, region.

const asyncHandler = require('../utils/asyncHandler');
const verifyDatasetAccess = require('../utils/verifyDatasetAccess');
const analyticsService = require('../services/analyticsService');

function extractFilters(req) {
  const { datasetId, startDate, endDate, category, region } = req.query;
  return {
    datasetId: Number(datasetId),
    startDate: startDate || null,
    endDate: endDate || null,
    category: category || null,
    region: region || null,
  };
}

// @route   GET /api/analytics/filters?datasetId=
// @access  Private
const getFilterOptions = asyncHandler(async (req, res) => {
  const dataset = await verifyDatasetAccess(req.user, req.query.datasetId);
  const options = await analyticsService.getFilterOptions(dataset.id);
  res.json({ success: true, ...options });
});

// @route   GET /api/analytics/dashboard
// @access  Private
// Compact bundle for the main Dashboard page: KPIs + trend + top 5 products
// + category/region breakdown, in one round trip.
const getDashboardSummary = asyncHandler(async (req, res) => {
  const filters = extractFilters(req);
  await verifyDatasetAccess(req.user, filters.datasetId);

  const [kpis, monthlyTrend, categoryPerformance, regionalPerformance, topProducts] =
    await Promise.all([
      analyticsService.getKpis(filters),
      analyticsService.getMonthlyTrend(filters),
      analyticsService.getCategoryPerformance(filters),
      analyticsService.getRegionalPerformance(filters),
      analyticsService.getTopProducts(filters, 5),
    ]);

  res.json({
    success: true,
    kpis,
    monthlyTrend,
    categoryPerformance,
    regionalPerformance,
    topProducts,
  });
});

// @route   GET /api/analytics/sales
// @access  Private
// Monthly sales & profit trend, for the Analytics page's trend charts.
const getSalesAnalytics = asyncHandler(async (req, res) => {
  const filters = extractFilters(req);
  await verifyDatasetAccess(req.user, filters.datasetId);

  const [kpis, monthlyTrend] = await Promise.all([
    analyticsService.getKpis(filters),
    analyticsService.getMonthlyTrend(filters),
  ]);

  res.json({ success: true, kpis, monthlyTrend });
});

// @route   GET /api/analytics/products
// @access  Private
const getProductAnalytics = asyncHandler(async (req, res) => {
  const filters = extractFilters(req);
  await verifyDatasetAccess(req.user, filters.datasetId);

  const [topProducts, weakProducts, categoryPerformance] = await Promise.all([
    analyticsService.getTopProducts(filters, 10),
    analyticsService.getWeakProducts(filters, 5),
    analyticsService.getCategoryPerformance(filters),
  ]);

  res.json({ success: true, topProducts, weakProducts, categoryPerformance });
});

// @route   GET /api/analytics/customers
// @access  Private
const getCustomerAnalytics = asyncHandler(async (req, res) => {
  const filters = extractFilters(req);
  await verifyDatasetAccess(req.user, filters.datasetId);

  const [topCustomers, repeatCustomers, kpis] = await Promise.all([
    analyticsService.getTopCustomers(filters, 10),
    analyticsService.getRepeatCustomerCount(filters),
    analyticsService.getKpis(filters),
  ]);

  res.json({
    success: true,
    topCustomers,
    repeatCustomers,
    totalCustomers: kpis.total_customers,
  });
});

// @route   GET /api/analytics/regions
// @access  Private
const getRegionAnalytics = asyncHandler(async (req, res) => {
  const filters = extractFilters(req);
  await verifyDatasetAccess(req.user, filters.datasetId);

  const [regionalPerformance, profitVsSales] = await Promise.all([
    analyticsService.getRegionalPerformance(filters),
    analyticsService.getProfitVsSales(filters, 300),
  ]);

  res.json({ success: true, regionalPerformance, profitVsSales });
});

module.exports = {
  getFilterOptions,
  getDashboardSummary,
  getSalesAnalytics,
  getProductAnalytics,
  getCustomerAnalytics,
  getRegionAnalytics,
};
