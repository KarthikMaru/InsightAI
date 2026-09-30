// File path: backend/controllers/explorerController.js
// Purpose: Powers the Data Explorer page — search, column sort,
// pagination, category/region filtering, and CSV export over a
// dataset's sales_records. Sort columns are whitelisted to prevent SQL
// injection via the `sortBy` query parameter.
//
// Converted from PostgreSQL:
//   - `ILIKE` -> `LIKE`. MySQL's default collation (utf8mb4_general_ci /
//     utf8mb4_0900_ai_ci, both case-insensitive) already makes `LIKE`
//     behave case-insensitively for normal text, matching ILIKE's
//     behavior without needing a separate operator.
//   - `$1, $2...` (where PostgreSQL let the same numbered placeholder be
//     reused across multiple `OR` branches bound to ONE parameter) -> `?`
//     placeholders, which are positional in MySQL: each `?` consumes its
//     own entry from the params array, so the search term is now pushed
//     once per `LIKE ?` occurrence rather than once total.
//   - `COUNT(*)::int` cast removed (COUNT already returns a JS number).
//   - Numbered `LIMIT $n OFFSET $n+1` -> plain `LIMIT ? OFFSET ?`.

const asyncHandler = require('../utils/asyncHandler');
const verifyDatasetAccess = require('../utils/verifyDatasetAccess');
const { query } = require('../config/db');
const { escapeCsvCell } = require('../utils/csvSafety');

const SORTABLE_COLUMNS = {
  order_id: 'sr.order_id',
  order_date: 'sr.order_date',
  product: 'p.name',
  category: 'c.name',
  region: 'r.name',
  customer: 'cu.name',
  quantity: 'sr.quantity',
  sales: 'sr.sales',
  profit: 'sr.profit',
  discount: 'sr.discount',
};

const BASE_QUERY = `
  FROM sales_records sr
  LEFT JOIN products p ON p.id = sr.product_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN regions r ON r.id = sr.region_id
  LEFT JOIN customers cu ON cu.id = sr.customer_id
`;

function buildWhere({ datasetId, search, category, region }) {
  const clauses = ['sr.dataset_id = ?'];
  const params = [datasetId];

  if (search) {
    clauses.push(
      '(sr.order_id LIKE ? OR p.name LIKE ? OR cu.name LIKE ? OR c.name LIKE ? OR r.name LIKE ?)'
    );
    const likeTerm = `%${search}%`;
    // One `?` per OR branch above -> push the same term 5 times.
    params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
  }
  if (category) {
    clauses.push('c.name = ?');
    params.push(category);
  }
  if (region) {
    clauses.push('r.name = ?');
    params.push(region);
  }

  return { sql: clauses.join(' AND '), params };
}

// @route   GET /api/datasets/:id/records
// @access  Private
const getRecords = asyncHandler(async (req, res) => {
  const dataset = await verifyDatasetAccess(req.user, req.params.id);

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const sortBy = SORTABLE_COLUMNS[req.query.sortBy] || 'sr.order_date';
  const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';

  const { sql: where, params } = buildWhere({
    datasetId: dataset.id,
    search: req.query.search,
    category: req.query.category,
    region: req.query.region,
  });

  const countResult = await query(
    `SELECT COUNT(*) AS total ${BASE_QUERY} WHERE ${where}`,
    params
  );
  const total = countResult.rows[0].total;

  const offset = (page - 1) * pageSize;
  const dataResult = await query(
    `SELECT sr.id, sr.order_id, sr.order_date, p.name AS product, c.name AS category,
            r.name AS region, cu.name AS customer, sr.quantity, sr.sales, sr.profit, sr.discount
     ${BASE_QUERY}
     WHERE ${where}
     ORDER BY ${sortBy} ${sortDir}
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  res.json({
    success: true,
    records: dataResult.rows,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});

// @route   GET /api/datasets/:id/records/export
// @access  Private
// Exports the filtered (not paginated) result set as CSV, capped at 20,000 rows.
const exportRecords = asyncHandler(async (req, res) => {
  const dataset = await verifyDatasetAccess(req.user, req.params.id);

  const { sql: where, params } = buildWhere({
    datasetId: dataset.id,
    search: req.query.search,
    category: req.query.category,
    region: req.query.region,
  });

  const result = await query(
    `SELECT sr.order_id, sr.order_date, p.name AS product, c.name AS category,
            r.name AS region, cu.name AS customer, sr.quantity, sr.sales, sr.profit, sr.discount
     ${BASE_QUERY}
     WHERE ${where}
     ORDER BY sr.order_date DESC
     LIMIT 20000`,
    params
  );

  const headers = ['Order ID', 'Order Date', 'Product', 'Category', 'Region', 'Customer', 'Quantity', 'Sales', 'Profit', 'Discount'];
  const rows = result.rows.map((r) =>
    [r.order_id, r.order_date, r.product, r.category, r.region, r.customer, r.quantity, r.sales, r.profit, r.discount]
      .map(escapeCsvCell)
      .join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${dataset.name.replace(/\s+/g, '_')}_export.csv"`);
  res.send(csv);
});

module.exports = { getRecords, exportRecords };
