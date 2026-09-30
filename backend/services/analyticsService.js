// File path: backend/services/analyticsService.js
// Purpose: All SQL-powered analytics for a dataset. Every function is
// scoped to a single dataset_id and accepts optional filters (date range,
// category, region). Uses JOIN, GROUP BY, HAVING, aggregate and date
// functions directly against the relational schema — no data is computed
// in JS beyond simple derived ratios (e.g. average order value).
//
// Converted from PostgreSQL:
//   - `$1, $2...` numbered placeholders -> plain `?` (MySQL placeholders
//     are positional and unnumbered, so the "next index" bookkeeping the
//     PostgreSQL version needed for LIMIT is no longer necessary).
//   - `::float` / `::int` casts removed — the connection pool is
//     configured with `decimalNumbers: true` (see config/db.js), so
//     SUM()/AVG() over DECIMAL columns already come back as JS numbers,
//     and COUNT() already returns a JS number in mysql2.
//   - `DATE_TRUNC('month', x)` + `TO_CHAR(..., 'YYYY-MM')` -> MySQL's
//     `DATE_FORMAT(x, '%Y-%m')`, used consistently in SELECT/GROUP
//     BY/ORDER BY so all three refer to the same monthly bucket.

const { query } = require('../config/db');

/**
 * Builds a WHERE clause + params array for the common filter set.
 * Base tables are always: sales_records sr, products p, categories c, regions r
 * (LEFT JOINed by the caller). Returns { sql, params }.
 */
function buildFilters({ datasetId, startDate, endDate, category, region }) {
  const clauses = ['sr.dataset_id = ?'];
  const params = [datasetId];

  if (startDate) {
    clauses.push('sr.order_date >= ?');
    params.push(startDate);
  }
  if (endDate) {
    clauses.push('sr.order_date <= ?');
    params.push(endDate);
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

const BASE_JOIN = `
  FROM sales_records sr
  LEFT JOIN products p ON p.id = sr.product_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN regions r ON r.id = sr.region_id
`;

const analyticsService = {
  // ---------- KPI summary ----------
  async getKpis(filters) {
    const { sql: where, params } = buildFilters(filters);
    const { rows } = await query(
      `SELECT
         COALESCE(SUM(sr.sales), 0) AS total_revenue,
         COALESCE(SUM(sr.profit), 0) AS total_profit,
         COUNT(DISTINCT sr.order_id) AS total_orders,
         COUNT(DISTINCT sr.customer_id) AS total_customers
       ${BASE_JOIN}
       WHERE ${where}`,
      params
    );
    const row = rows[0];
    const avgOrderValue = row.total_orders > 0 ? row.total_revenue / row.total_orders : 0;
    return { ...row, avg_order_value: Number(avgOrderValue.toFixed(2)) };
  },

  // ---------- Monthly sales & profit trend ----------
  async getMonthlyTrend(filters) {
    const { sql: where, params } = buildFilters(filters);
    const { rows } = await query(
      `SELECT
         DATE_FORMAT(sr.order_date, '%Y-%m') AS month,
         COALESCE(SUM(sr.sales), 0) AS sales,
         COALESCE(SUM(sr.profit), 0) AS profit,
         COUNT(DISTINCT sr.order_id) AS orders
       ${BASE_JOIN}
       WHERE ${where}
       GROUP BY DATE_FORMAT(sr.order_date, '%Y-%m')
       ORDER BY DATE_FORMAT(sr.order_date, '%Y-%m')`,
      params
    );
    return rows;
  },

  // ---------- Category performance ----------
  async getCategoryPerformance(filters) {
    const { sql: where, params } = buildFilters(filters);
    const { rows } = await query(
      `SELECT
         c.name AS category,
         COALESCE(SUM(sr.sales), 0) AS total_sales,
         COALESCE(SUM(sr.profit), 0) AS total_profit,
         COUNT(DISTINCT sr.order_id) AS orders
       ${BASE_JOIN}
       WHERE ${where} AND c.name IS NOT NULL
       GROUP BY c.name
       HAVING SUM(sr.sales) > 0
       ORDER BY total_sales DESC`,
      params
    );
    return rows;
  },

  // ---------- Regional performance ----------
  async getRegionalPerformance(filters) {
    const { sql: where, params } = buildFilters(filters);
    const { rows } = await query(
      `SELECT
         r.name AS region,
         COALESCE(SUM(sr.sales), 0) AS total_sales,
         COALESCE(SUM(sr.profit), 0) AS total_profit,
         COUNT(DISTINCT sr.order_id) AS orders
       ${BASE_JOIN}
       WHERE ${where} AND r.name IS NOT NULL
       GROUP BY r.name
       HAVING SUM(sr.sales) > 0
       ORDER BY total_sales DESC`,
      params
    );
    return rows;
  },

  // ---------- Top products ----------
  async getTopProducts(filters, limit = 10) {
    const { sql: where, params } = buildFilters(filters);
    const { rows } = await query(
      `SELECT
         p.name AS product,
         c.name AS category,
         COALESCE(SUM(sr.sales), 0) AS total_sales,
         COALESCE(SUM(sr.profit), 0) AS total_profit,
         COALESCE(SUM(sr.quantity), 0) AS total_quantity
       ${BASE_JOIN}
       WHERE ${where} AND p.name IS NOT NULL
       GROUP BY p.name, c.name
       ORDER BY total_sales DESC
       LIMIT ?`,
      [...params, limit]
    );
    return rows;
  },

  // ---------- Weak performing products (low or negative profit) ----------
  async getWeakProducts(filters, limit = 5) {
    const { sql: where, params } = buildFilters(filters);
    const { rows } = await query(
      `SELECT
         p.name AS product,
         c.name AS category,
         COALESCE(SUM(sr.sales), 0) AS total_sales,
         COALESCE(SUM(sr.profit), 0) AS total_profit
       ${BASE_JOIN}
       WHERE ${where} AND p.name IS NOT NULL
       GROUP BY p.name, c.name
       HAVING SUM(sr.sales) > 0
       ORDER BY total_profit ASC
       LIMIT ?`,
      [...params, limit]
    );
    return rows;
  },

  // ---------- Top customers ----------
  async getTopCustomers(filters, limit = 10) {
    const { sql: where, params } = buildFilters(filters);
    const { rows } = await query(
      `SELECT
         cu.name AS customer,
         COUNT(DISTINCT sr.order_id) AS orders,
         COALESCE(SUM(sr.sales), 0) AS total_sales,
         COALESCE(SUM(sr.profit), 0) AS total_profit
       ${BASE_JOIN}
       LEFT JOIN customers cu ON cu.id = sr.customer_id
       WHERE ${where} AND cu.name IS NOT NULL
       GROUP BY cu.name
       ORDER BY total_sales DESC
       LIMIT ?`,
      [...params, limit]
    );
    return rows;
  },

  // ---------- Repeat customer count (HAVING on distinct order count) ----------
  async getRepeatCustomerCount(filters) {
    const { sql: where, params } = buildFilters(filters);
    const { rows } = await query(
      `SELECT COUNT(*) AS repeat_customers FROM (
         SELECT cu.id
         ${BASE_JOIN}
         LEFT JOIN customers cu ON cu.id = sr.customer_id
         WHERE ${where} AND cu.id IS NOT NULL
         GROUP BY cu.id
         HAVING COUNT(DISTINCT sr.order_id) > 1
       ) repeat_sub`,
      params
    );
    return rows[0].repeat_customers;
  },

  // ---------- Profit vs Sales per order (for scatter chart) ----------
  async getProfitVsSales(filters, limit = 300) {
    const { sql: where, params } = buildFilters(filters);
    const { rows } = await query(
      `SELECT
         sr.order_id,
         COALESCE(SUM(sr.sales), 0) AS sales,
         COALESCE(SUM(sr.profit), 0) AS profit
       ${BASE_JOIN}
       WHERE ${where}
       GROUP BY sr.order_id
       ORDER BY sales DESC
       LIMIT ?`,
      [...params, limit]
    );
    return rows;
  },

  // ---------- Distinct filter options (categories & regions available in this dataset) ----------
  async getFilterOptions(datasetId) {
    const { rows: categories } = await query(
      `SELECT DISTINCT c.name FROM sales_records sr
       JOIN products p ON p.id = sr.product_id
       JOIN categories c ON c.id = p.category_id
       WHERE sr.dataset_id = ? ORDER BY c.name`,
      [datasetId]
    );
    const { rows: regions } = await query(
      `SELECT DISTINCT r.name FROM sales_records sr
       JOIN regions r ON r.id = sr.region_id
       WHERE sr.dataset_id = ? ORDER BY r.name`,
      [datasetId]
    );
    return {
      categories: categories.map((r) => r.name),
      regions: regions.map((r) => r.name),
    };
  },
  // ---------- Full composite summary (used to ground the AI assistant / insights) ----------
  async getFullSummary(datasetId) {
    const filters = { datasetId };
    const [kpis, monthlyTrend, categoryPerformance, regionalPerformance, topProducts, weakProducts, topCustomers, repeatCustomers] =
      await Promise.all([
        this.getKpis(filters),
        this.getMonthlyTrend(filters),
        this.getCategoryPerformance(filters),
        this.getRegionalPerformance(filters),
        this.getTopProducts(filters, 10),
        this.getWeakProducts(filters, 5),
        this.getTopCustomers(filters, 10),
        this.getRepeatCustomerCount(filters),
      ]);

    return {
      kpis,
      monthlyTrend,
      categoryPerformance,
      regionalPerformance,
      topProducts,
      weakProducts,
      topCustomers,
      repeatCustomers,
    };
  },
};

module.exports = analyticsService;
