// File path: backend/routes/reportRoutes.js
// Purpose: Routes for generating, listing, downloading, and deleting
// PDF business reports.

const express = require('express');
const { protect } = require('../middleware/auth');
const {
  generateReport,
  listReports,
  downloadReport,
  deleteReport,
} = require('../controllers/reportController');

const router = express.Router();

router.use(protect);

router.post('/generate', generateReport);
router.get('/', listReports);
router.get('/:id/download', downloadReport);
router.delete('/:id', deleteReport);

module.exports = router;
