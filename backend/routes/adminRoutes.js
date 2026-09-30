// File path: backend/routes/adminRoutes.js
// Purpose: Admin-only routes for platform stats, user/dataset visibility,
// and activity monitoring. Dataset deletion for admins reuses the
// existing DELETE /api/datasets/:id endpoint, which already allows an
// admin to delete any dataset regardless of ownership.

const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { getStats, getUsers, getDatasets, getActivities } = require('../controllers/adminController');

const router = express.Router();

router.use(protect, authorize('admin'));

router.get('/stats', getStats);
router.get('/users', getUsers);
router.get('/datasets', getDatasets);
router.get('/activities', getActivities);

module.exports = router;
