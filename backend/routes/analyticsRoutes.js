// File path: backend/routes/analyticsRoutes.js
// Purpose: Routes for the SQL analytics engine. All require authentication;
// dataset ownership is verified per-request inside the controller.

const express = require('express');
const { protect } = require('../middleware/auth');
const {
  getFilterOptions,
  getDashboardSummary,
  getSalesAnalytics,
  getProductAnalytics,
  getCustomerAnalytics,
  getRegionAnalytics,
} = require('../controllers/analyticsController');

const router = express.Router();

router.use(protect);

router.get('/filters', getFilterOptions);
router.get('/dashboard', getDashboardSummary);
router.get('/sales', getSalesAnalytics);
router.get('/products', getProductAnalytics);
router.get('/customers', getCustomerAnalytics);
router.get('/regions', getRegionAnalytics);

module.exports = router;
