// File path: backend/routes/datasetRoutes.js
// Purpose: Routes for CSV upload, sample dataset loading, listing,
// detail/preview, and deletion. All routes require authentication.

const express = require('express');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/auth');
const {
  uploadDataset,
  useSampleDataset,
  createManualDataset,
  generateAiDataset,
  listDatasets,
  getDataset,
  deleteDataset,
  renameDataset,
  duplicateDataset,
} = require('../controllers/datasetController');
const { getRecords, exportRecords } = require('../controllers/explorerController');
const {
  getProfile,
  getGenericRecords,
  exportGenericRecords,
  getGenericAnalytics,
  exportDataset,
} = require('../controllers/genericController');
const {
  addRow,
  updateRow,
  deleteRow,
  duplicateRow,
  addColumn,
  renameColumn,
  previewColumnTypeChange,
  changeColumnType,
  deleteColumn,
  reorderColumns,
} = require('../controllers/datasetEditController');
const {
  proposeModification,
  applyModification,
  cancelModification,
} = require('../controllers/aiModificationController');

const router = express.Router();

router.use(protect);

router.post('/upload', upload.single('file'), uploadDataset);
router.post('/sample', useSampleDataset);
router.post('/manual', createManualDataset);
router.post('/generate-ai', generateAiDataset);
router.get('/', listDatasets);
router.get('/:id', getDataset);
router.patch('/:id', renameDataset);
router.delete('/:id', deleteDataset);
router.post('/:id/duplicate', duplicateDataset);

// Data Explorer — legacy sales-shaped datasets (sales_records table)
router.get('/:id/records', getRecords);
router.get('/:id/records/export', exportRecords);

// General-purpose datasets — profile, dynamic explorer, dynamic analytics
router.get('/:id/profile', getProfile);
router.get('/:id/generic-records', getGenericRecords);
router.get('/:id/generic-records/export', exportGenericRecords);
router.get('/:id/generic-analytics', getGenericAnalytics);
router.get('/:id/export', exportDataset);

// Dataset Editor — mutable rows/columns (general-purpose datasets only)
router.post('/:id/rows', addRow);
router.put('/:id/rows/:rowId', updateRow);
router.delete('/:id/rows/:rowId', deleteRow);
router.post('/:id/rows/:rowId/duplicate', duplicateRow);

router.post('/:id/columns', addColumn);
router.patch('/:id/columns/reorder', reorderColumns);
router.patch('/:id/columns/:columnName/rename', renameColumn);
router.get('/:id/columns/:columnName/type-preview', previewColumnTypeChange);
router.patch('/:id/columns/:columnName/type', changeColumnType);
router.delete('/:id/columns/:columnName', deleteColumn);

// AI-powered dataset modification — propose, preview, confirm, apply
router.post('/:id/ai-modify/propose', proposeModification);
router.post('/:id/ai-modify/apply', applyModification);
router.delete('/:id/ai-modify/:token', cancelModification);

module.exports = router;
