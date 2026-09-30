// File path: backend/routes/aiRoutes.js
// Purpose: Routes for the AI assistant, automated insights, and
// natural-language-to-SQL. All require authentication; dataset ownership
// is verified per-request inside the controller.

const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const {
  chat,
  generateInsights,
  getCachedInsights,
  textToSql,
  getHistory,
} = require('../controllers/aiController');

const router = express.Router();

router.use(protect);

router.post(
  '/chat',
  [body('question').trim().notEmpty().withMessage('A question is required')],
  chat
);
router.post('/generate-insights', generateInsights);
router.get('/insights', getCachedInsights);
router.post(
  '/text-to-sql',
  [body('question').trim().notEmpty().withMessage('A question is required')],
  textToSql
);
router.get('/history', getHistory);

module.exports = router;
