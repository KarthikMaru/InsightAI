# InsightAI — API Documentation

Base URL (local): `http://localhost:5000/api`

All endpoints except `/auth/register`, `/auth/login`, and `/health` require a JWT in the request header:

```
Authorization: Bearer <token>
```

Every response follows the shape `{ success: boolean, message?: string, ...data }`. Errors return `{ success: false, message: string }` with an appropriate HTTP status code (400, 401, 403, 404, 409, 500, 502).

---

## Auth

### `POST /auth/register`
Creates a user + a default business profile in one transaction.

**Body:**
```json
{ "name": "Jane Doe", "email": "jane@acme.com", "password": "at least 8 chars", "businessName": "Acme Retail (optional)" }
```
**Response `201`:** `{ success, token, user: { id, name, email, role, created_at } }`

### `POST /auth/login`
**Body:** `{ "email": "...", "password": "..." }`
**Response `200`:** `{ success, token, user }`

Both `/register` and `/login` are additionally rate-limited to 20 requests / 15 minutes per IP.

### `GET /auth/profile`
Returns the current user and their business profile.

### `PUT /auth/profile`
**Body (all optional):** `{ "name": "...", "businessName": "...", "industry": "..." }`

### `PUT /auth/change-password`
**Body:** `{ "currentPassword": "...", "newPassword": "at least 8 chars" }`

---

## Datasets

### `POST /datasets/upload`
`multipart/form-data` with a `file` field (`.csv`, max 15MB) and optional `name` field.

Required CSV columns (case-insensitive): `Order ID, Order Date, Customer Name, Customer ID, Product, Category, Region, Quantity, Sales, Profit, Discount`.

**Response `201`:**
```json
{
  "success": true,
  "dataset": { "id": 1, "name": "...", "row_count": 3000, "status": "ready", ... },
  "rowsInserted": 2985,
  "rowsRejected": 15,
  "sampleErrors": [{ "row": 42, "issues": ["Invalid Quantity"] }]
}
```

### `POST /datasets/sample`
Loads the bundled 3,000-row Superstore-style sample dataset for the current business. Same response shape as upload.

### `GET /datasets`
Lists the current business's datasets.

### `GET /datasets/:id`
Returns dataset metadata plus a 20-row preview (most recent orders).

### `DELETE /datasets/:id`
Deletes a dataset and (via `ON DELETE CASCADE`) all its sales records, insights, and AI query history. Owner or admin only.

### `GET /datasets/:id/records`
Data Explorer — paginated/sortable/searchable/filterable records.

**Query params:** `page` (default 1), `pageSize` (default 20, max 100), `search`, `sortBy` (one of `order_id, order_date, product, category, region, customer, quantity, sales, profit, discount`), `sortDir` (`asc`/`desc`), `category`, `region`.

**Response:** `{ success, records: [...], pagination: { page, pageSize, total, totalPages } }`

### `GET /datasets/:id/records/export`
Same filters as above (no pagination). Streams a CSV file, capped at 20,000 rows.

---

## Analytics

All analytics endpoints require `datasetId` as a query parameter and accept optional `startDate`, `endDate` (`YYYY-MM-DD`), `category`, `region` filters. The requesting user must own the dataset (or be an admin).

### `GET /analytics/filters?datasetId=`
Returns `{ categories: [...], regions: [...] }` — the distinct values actually present in the dataset, for populating filter dropdowns.

### `GET /analytics/dashboard?datasetId=`
Compact bundle for the main Dashboard: `{ kpis, monthlyTrend, categoryPerformance, regionalPerformance, topProducts }`.

### `GET /analytics/sales?datasetId=&startDate=&endDate=&category=&region=`
`{ kpis, monthlyTrend }` — used by the Analytics page.

### `GET /analytics/products?datasetId=...`
`{ topProducts, weakProducts, categoryPerformance }`.

### `GET /analytics/customers?datasetId=...`
`{ topCustomers, repeatCustomers, totalCustomers }`.

### `GET /analytics/regions?datasetId=...`
`{ regionalPerformance, profitVsSales }`.

`kpis` shape: `{ total_revenue, total_profit, total_orders, total_customers, avg_order_value }`.

---

## AI

### `POST /ai/chat`
Grounded business Q&A. Retrieves a full analytics summary for the dataset first, then asks Gemini to answer using only that data.

**Body:** `{ "datasetId": 1, "question": "Which region generated the highest profit?" }`
**Response:** `{ success, question, answer }`

### `POST /ai/generate-insights`
Generates and caches categorized insights (sales/customer/regional/product), replacing any previous set for the dataset.

**Body:** `{ "datasetId": 1 }`
**Response:** `{ success, insights: [{ id, category, title, content, created_at }] }`

### `GET /ai/insights?datasetId=`
Returns the cached insights without calling Gemini again.

### `POST /ai/text-to-sql`
Natural-language-to-SQL. Gemini proposes a query, which is validated (SELECT-only, single statement, whitelisted tables, no comments/DDL/CTEs) and then executed inside a dataset-scoping wrapper.

**Body:** `{ "datasetId": 1, "question": "Show top 5 products by revenue" }`
**Response `200`:**
```json
{
  "success": true,
  "question": "Show top 5 products by revenue",
  "generatedSql": "SELECT p.name AS product, SUM(sr.sales) AS revenue FROM sales_records sr JOIN products p ON p.id = sr.product_id GROUP BY p.name ORDER BY revenue DESC LIMIT 5",
  "result": [ { "product": "...", "revenue": 12345.67 }, ... ],
  "explanation": "Your top product by revenue is ..."
}
```
**Response `400`** if the generated query fails safety validation, with the specific reasons in `message`.

### `GET /ai/history?datasetId=`
Last 20 AI interactions (chat + text-to-SQL) for the dataset.

---

## Reports

### `POST /reports/generate`
**Body:** `{ "datasetId": 1, "reportType": "monthly_sales" | "product_performance" | "regional" | "customer" }`
**Response `201`:** `{ success, report: { id, report_type, file_path, created_at, ... } }`

### `GET /reports`
Lists the current user's generated reports.

### `GET /reports/:id/download`
Streams the PDF file. JWT-protected — the frontend fetches this as a blob through the authenticated axios instance rather than a plain link.

### `DELETE /reports/:id`
Deletes the report row and its PDF file. Owner or admin only.

---

## Admin
*(All routes below additionally require `role = 'admin'`.)*

### `GET /admin/stats`
`{ totalUsers, totalDatasets, totalRecordsProcessed, totalAiQueries, totalReports }`

### `GET /admin/users?page=`
Paginated user list (20 per page).

### `GET /admin/datasets?page=`
Paginated dataset list across all businesses, joined with owner email.

### `GET /admin/activities`
Last 50 platform activity log entries (registrations, logins, uploads, deletes, AI insight generation, report generation, profile/password changes).

---

## Health

### `GET /health`
`{ success: true, message: "InsightAI API is running" }` — no auth required. Useful for deployment platform health checks.
