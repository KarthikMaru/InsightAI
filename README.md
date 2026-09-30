# InsightAI — AI-Powered Business Intelligence & Sales Analytics Platform

A production-style full-stack SaaS platform where a business uploads sales data and gets interactive dashboards, SQL-powered analytics, PDF reports, and an AI assistant that answers questions using their real data — not invented numbers.

Built end-to-end: MySQL schema design → REST API → SQL analytics engine → Gemini AI integration with a validated natural-language-to-SQL feature → React dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Axios, Recharts, lucide-react |
| Backend | Node.js, Express.js, REST APIs |
| Database | MySQL 8.0+ (12 tables, foreign keys, indexes) |
| Auth | JWT + bcrypt, role-based authorization (`user` / `admin`) |
| AI | Google Gemini API, grounded on SQL-retrieved data |
| Other | Multer + csv-parser (CSV ingestion), PDFKit (reports), Jest (testing), Helmet/CORS/rate-limiting (security) |

---

## Features

1. JWT authentication (register/login/logout, bcrypt hashing, protected routes)
2. Business/user profile management (edit name/business, change password)
3. CSV dataset upload with header + row-level validation
4. Normalized SQL storage (categories, products, customers, regions, sales_records)
5. Business analytics dashboard (KPI cards, trend/breakdown charts)
6. Revenue, profit, orders, customers, average order value KPIs
7. Sales/category/region/product charts (Recharts) + a profit-vs-sales scatter
8. Date range, category, and region filters across the Analytics page
9. SQL analytics engine using `JOIN`, `GROUP BY`, `HAVING`, aggregates, and `DATE_TRUNC`
10. AI Business Assistant (Gemini) — grounded in real SQL-retrieved data
11. Automated, categorized AI insights (sales/customer/regional/product) with one-click regeneration
12. Natural Language → SQL, with the generated query, real results, and a plain-English explanation shown
13. SELECT-only SQL validator (multi-layer: statement count, keyword blacklist, table whitelist, dataset-scoping wrapper)
14. Data Explorer — search, column sort, pagination, category/region filters, CSV export
15. PDF reports — Monthly Sales, Product Performance, Regional, Customer
16. Admin Dashboard — platform stats, user/dataset visibility, activity log, dataset moderation
17. Bundled sample dataset (3,000 realistic Superstore-style rows) so the app works without any upload
18. Error/loading/empty states throughout, input validation, rate limiting, startup env validation, Jest tests for the safety-critical logic

---

## System Architecture

```
                    ┌─────────────────┐
                    │   React (Vite)   │
                    │   Frontend SPA   │
                    └────────┬─────────┘
                             │ Axios (JWT in headers)
                    ┌────────▼─────────┐
                    │  Express REST API │
                    │  (Node.js)        │
                    ├───────────────────┤
                    │ authMiddleware    │
                    │ controllers       │
                    │ services          │
                    └───┬───────────┬───┘
                        │           │
              ┌─────────▼──┐   ┌────▼─────────┐
              │   MySQL    │   │ Gemini API    │
              │ (pg pool)  │   │ (AI insights) │
              └────────────┘   └───────────────┘
```

**AI request flow:** question → backend retrieves real analytics data via SQL → data + question sent to Gemini → grounded answer returned. For natural-language-to-SQL specifically: question → Gemini proposes SQL → validated (SELECT-only, single statement, whitelisted tables, no comments/DDL/CTEs) → wrapped in a dataset-scoping CTE → executed → Gemini explains the actual result.

---

## Database Schema

12 tables, fully normalized, with foreign keys and indexes on every join/filter column:

```
users (1) ───< businesses (1) ───< datasets (1) ───< sales_records
                                                          │
                                      products ───────────┤
                                      customers ──────────┤
                                      regions ────────────┘
                                      categories ── products

users (1) ───< ai_queries
users (1) ───< reports
users (1) ───< activities
datasets (1) ───< ai_insights
```

- **users** — auth + role
- **businesses** — one per user
- **datasets** — uploaded CSVs; tracks status/row counts
- **categories / products / customers / regions** — normalized lookup tables, deduped from CSV rows
- **sales_records** — the fact table (FKs to dataset/product/customer/region + quantity/sales/profit/discount)
- **ai_queries** — every AI interaction logged (question, generated SQL, result summary, response)
- **ai_insights** — cached categorized insights per dataset
- **reports** — generated PDF metadata
- **activities** — admin audit log

Full DDL: [`backend/database/schema.sql`](backend/database/schema.sql)

### Notes on the PostgreSQL → MySQL conversion

This project was originally built on PostgreSQL and fully migrated to MySQL. If you're comparing against an earlier version or just curious what changes a cross-database migration actually touches:

- **Driver**: `pg` → `mysql2/promise`, via a single `config/db.js` wrapper (`query()` / `getConnection()`) so the rest of the app didn't need to change shape.
- **Placeholders**: PostgreSQL's numbered `$1, $2...` (which can be reused across multiple clauses) → MySQL's positional `?` (must appear once per binding — reused search terms are pushed multiple times into the params array).
- **No `RETURNING` clause in MySQL**: every `INSERT ... RETURNING ...` became `INSERT` + `insertId` + a follow-up `SELECT`.
- **Upserts**: `INSERT ... ON CONFLICT (cols) DO NOTHING` → `INSERT IGNORE INTO ...`, relying on the same `UNIQUE KEY` constraints.
- **Transactions**: `pool.connect()` + literal `BEGIN`/`COMMIT`/`ROLLBACK` query strings → `pool.getConnection()` + `connection.beginTransaction()/commit()/rollback()`.
- **DDL**: `SERIAL` → `INT AUTO_INCREMENT`; `CREATE TYPE ... AS ENUM` → inline `ENUM(...)` columns; `TIMESTAMPTZ` → `DATETIME`; `NUMERIC` → `DECIMAL`; `JSONB` → `JSON`; every table explicitly `ENGINE=InnoDB` (required for foreign keys).
- **Date functions**: `DATE_TRUNC('month', x)` + `TO_CHAR(x, 'YYYY-MM')` → `DATE_FORMAT(x, '%Y-%m')`.
- **Case-insensitive search**: `ILIKE` → `LIKE` (MySQL's default utf8mb4 collations are already case-insensitive).
- **Numeric type coercion**: the pool is configured with `decimalNumbers: true` so `SUM()`/`AVG()` over `DECIMAL` columns return JS numbers instead of strings — this replaces the PostgreSQL version's per-query `::float`/`::int` casts with one connection-level setting.
- **Multi-statement schema loading**: MySQL requires an explicit `multipleStatements: true` connection flag to run a whole `.sql` file in one call; `seed.js` opens one short-lived connection with that flag just for the initial schema load, rather than enabling it pool-wide (which would widen the SQL-injection blast radius on every other query in the app).
- **SQL validator hardening**: the natural-language-to-SQL safety layer gained MySQL-specific checks that PostgreSQL didn't need — blocking `INTO OUTFILE`/`INTO DUMPFILE`/`LOAD_FILE()` (MySQL's file-system read/write primitives) and MySQL's `#` single-line comment style, alongside the existing `information_schema`/system-schema and schema-qualification blocks.

The frontend, all API endpoints/contracts, authentication, AI/Gemini integration, sample data, and every feature are unchanged — only the database layer was touched.

---

## Folder Structure

```
insightai/
├── backend/
│   ├── config/          db.js, validateEnv.js
│   ├── controllers/     auth, dataset, analytics, ai, report, admin, explorer
│   ├── database/        schema.sql, seed.js, sampleData/superstore_sample.csv
│   ├── middleware/      auth.js, upload.js, errorHandler.js
│   ├── models/          one file per table
│   ├── routes/          one file per resource
│   ├── services/        csvService, ingestionService, analyticsService,
│   │                     geminiService, sqlValidator, reportService
│   ├── tests/           sqlValidator.test.js, csvHelpers.test.js (Jest)
│   ├── utils/           asyncHandler, ApiError, generateToken, verifyDatasetAccess
│   └── server.js
└── frontend/
    └── src/
        ├── components/   DashboardLayout, KpiCard, FilterBar, charts/, ...
        ├── pages/        Landing, Login, Register, Dashboard, Upload, Analytics,
        │                  AIAssistant, AIInsights, Reports, DataExplorer, Admin,
        │                  Profile, NotFound
        ├── context/       AuthContext
        ├── services/      one file per API resource
        └── hooks/         useDatasets
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- MySQL 8.0+ (Community Server, or the server bundled with MySQL Workbench) — 8.0+ is required for JSON columns and the CTE syntax used by the natural-language-to-SQL feature

### 1. Create the database (MySQL Workbench)

You can do this either from the MySQL Workbench UI or its Query tab — both are the same underlying SQL:

1. Open MySQL Workbench and connect to your local server (the connection you use to connect via `root` on `localhost:3306` is the default).
2. Open a new SQL tab (**File → New Query Tab**) and run:
   ```sql
   CREATE DATABASE insightai CHARACTER SET utf8mb4;
   ```
3. That's it for setup in Workbench — the actual tables are created by the seed script below, not manually. If you'd rather see it happen visually, you can instead open `backend/database/schema.sql` in Workbench (**File → Open SQL Script**), make sure the `insightai` schema is selected as your default schema (double-click it in the Schemas panel on the left), and execute the whole script (the lightning bolt icon) — either path (Workbench or `npm run seed`) produces the same schema.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your local MySQL credentials:

```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=insightai
DB_USER=root
DB_PASSWORD=your_mysql_root_password
```

Then apply the schema and seed the default admin account:

```bash
npm run seed
npm run dev
```

`npm run seed` creates all 12 tables (skip this if you already ran `schema.sql` manually in Workbench in step 1 — running it twice is safe though, since the admin insert is idempotent, but `CREATE TABLE` will error on tables that already exist) and creates:
- Admin login: `admin@insightai.com` / `Admin@12345` — **change this immediately if deploying anywhere real.**

The API runs at `http://localhost:5000`. Health check: `GET http://localhost:5000/api/health`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`, proxying `/api` to `http://localhost:5000` (see `vite.config.js`) — no CORS setup needed in dev.

### 4. Try it out

1. Register an account (or log in as the seeded admin)
2. Go to **Upload Dataset** → click **Explore with sample dataset** for instant data, or upload your own CSV
3. **Dashboard** and **Analytics** now show real KPIs and charts
4. **AI Assistant** → ask a question, or switch to **Ask in SQL** mode to see generated SQL + real results
5. **AI Insights** → click **Regenerate insights**
6. **Data Explorer** → search/sort/filter/export your raw records
7. **Reports** → generate and download a PDF
8. Log in as admin to see the **Admin Dashboard**

### 5. Inspecting the data in Workbench

Once you've loaded the sample dataset through the app, you can browse it directly in Workbench: select the `insightai` schema in the left panel, expand **Tables**, and right-click any table (e.g. `sales_records`) → **Select Rows - Limit 1000** to see the actual ingested data.

### 6. Running tests

```bash
cd backend
npm test
```

Covers the two most safety-critical pieces of logic: the SELECT-only SQL validator (16 tests — safe queries, DROP-via-semicolon, DELETE/UPDATE, cross-tenant table access, SQL comments including MySQL's `#` style, `information_schema` access, the MySQL-specific `INTO OUTFILE` file-write vector, CTE injection, dataset-scoping wrapper correctness) and the CSV parsing helpers (12 tests — header normalization, date parsing, number parsing). Neither test file needs a database connection to run.

---

## Environment Variables

See [`backend/.env.example`](backend/.env.example) for the full list. Required: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`. The server validates these at startup (`config/validateEnv.js`) and refuses to boot with a clear error if any are missing. `GEMINI_API_KEY` is recommended but not required to boot — AI routes return a clear error until it's set.

---

## API Documentation

Full endpoint reference with request/response examples: [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md)

## Deployment Guide

Step-by-step guide for deploying the backend, database, and frontend to production: [`DEPLOYMENT.md`](DEPLOYMENT.md)

---

## Security

- Passwords hashed with bcrypt (10 salt rounds)
- JWT auth with configurable expiry; every protected route re-verifies the user still exists
- Role-based authorization (`authorize('admin')`) on all admin routes
- Every dataset-scoped endpoint verifies the requester owns the dataset (or is admin) before running any query — `utils/verifyDatasetAccess.js`
- Natural-language-to-SQL is the one feature that lets AI output reach the database, so it gets defense in depth:
  1. Table whitelist (only `sales_records`, `products`, `categories`, `customers`, `regions` — never `users`/`businesses`/`datasets`)
  2. Single-statement, SELECT-only, no comments (including MySQL's `#` line-comment style), no DDL/DML keywords, no CTEs, no schema/database-qualified or system-schema (`information_schema`, `mysql`, `performance_schema`, `sys`) references, and no MySQL-specific file I/O primitives (`INTO OUTFILE`, `INTO DUMPFILE`, `LOAD_FILE()`, `LOAD DATA`)
  3. Even a validated query is force-scoped to the caller's own dataset via a CTE that shadows `sales_records` with a parameterized `WHERE dataset_id = ?` filter — never string-concatenated
  4. Server-enforced `LIMIT` if the query doesn't specify one
- General API rate limiting (200 req/15min) plus a stricter limiter on `/auth/login` and `/auth/register` (20 req/15min)
- Helmet for security headers, CORS restricted to the configured client origin, `express-validator` on all mutating auth/dataset endpoints
- File upload validation: `.csv` only, 15MB cap, header + per-row validation before any data reaches the database
- Environment variables validated at startup; secrets never hardcoded, `.env.example` provided, `.env` gitignored

---

## GitHub Project Description

> **InsightAI** — A full-stack, AI-powered business intelligence platform built with React, Node.js/Express, and MySQL. Users upload sales CSVs and get real-time analytics dashboards, a SQL analytics engine (JOIN/GROUP BY/HAVING/aggregate queries), PDF reporting, and a Gemini-powered AI assistant with a security-hardened natural-language-to-SQL feature. Includes JWT auth, role-based admin tooling, and a Jest test suite covering the SQL safety validator.

## Resume Project Description

**InsightAI — AI-Powered Business Intelligence & Sales Analytics Platform** *(React, Node.js, Express, MySQL, Google Gemini API)*

- Architected and built a full-stack SaaS analytics platform with a 12-table normalized MySQL schema, JWT/bcrypt authentication with role-based authorization, and a REST API of 35+ endpoints across auth, datasets, analytics, AI, reports, and admin functionality
- Designed a SQL analytics engine using JOIN, GROUP BY, HAVING, and aggregate/date functions to power live KPI dashboards, trend charts, and category/regional/product/customer breakdowns with dynamic date-range and category filters
- Integrated Google Gemini to build a grounded AI business assistant and a natural-language-to-SQL feature, implementing a multi-layer SQL validator (statement whitelisting, keyword blacklisting, dataset-scoping query rewriting) verified with a 24-case Jest test suite covering SQL injection and cross-tenant access attempts
