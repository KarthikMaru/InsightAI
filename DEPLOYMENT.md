# InsightAI — Deployment Guide

This guide covers deploying the backend (Node/Express + MySQL), the frontend (static Vite build), and the environment configuration that connects them.

## Architecture for production

```
Frontend (static build)  --->  Backend API (Node/Express)  --->  MySQL
   Vercel / Netlify              Render / Railway / Fly.io       Managed MySQL
                                        |
                                        v
                                  Google Gemini API
```

The frontend and backend are deployed as two separate services. The frontend is a static build (`npm run build` produces `frontend/dist/`) that talks to the backend over HTTPS.

---

## 1. Database (MySQL)

Use a managed MySQL 8.0+ instance — PlanetScale, Railway, Render, AWS RDS for MySQL, or Google Cloud SQL for MySQL all work fine. **8.0+ is required** (not 5.7) — the app uses JSON columns and CTE (`WITH ...`) syntax in the natural-language-to-SQL feature, both of which need MySQL 8.

1. Create the database:
   ```sql
   CREATE DATABASE insightai CHARACTER SET utf8mb4;
   ```
2. Apply the schema. Either:
   - Point the `DB_*` env vars at the remote instance locally and run `npm run seed` from `backend/` (applies `schema.sql` **and** creates the default admin account), or
   - Run the DDL directly: `mysql -h <host> -P <port> -u <user> -p insightai < backend/database/schema.sql`
3. Note the connection details (host, port, database name, user, password) — most managed providers give you these as discrete values already; a few (PlanetScale in particular) give a single connection URL, which you can parse into `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`.
4. For managed MySQL providers that require SSL (PlanetScale does; most others make it optional but recommended), add `ssl: { rejectUnauthorized: true }` (or the provider's specific CA config) to the `mysql.createPool(...)` call in `backend/config/db.js`.
5. **PlanetScale-specific note:** PlanetScale doesn't enforce traditional foreign key constraints in the same way a standalone MySQL server does (it uses Vitess under the hood). The app's schema defines real foreign keys, which will work on RDS/Cloud SQL/a plain MySQL server without changes; on PlanetScale you'd typically remove the `CONSTRAINT ... FOREIGN KEY` clauses and rely on the applicaton-level `ON DELETE CASCADE` logic already present in the code (e.g. `datasetModel.delete()` relies on cascading deletes — without real FKs you'd need to delete child rows manually). For a straightforward deploy, a plain managed MySQL instance (RDS, Cloud SQL, Railway, Render) is the simpler choice since it supports the schema exactly as written.

## 2. Backend (Node/Express)

Any Node host works (Render, Railway, Fly.io, a plain VPS). Steps below are provider-agnostic.

1. **Build command:** `npm install` (from `backend/`)
2. **Start command:** `npm start` (runs `node server.js`)
3. **Environment variables** (set these in your host's dashboard — never commit `.env`):

   | Variable | Notes |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | Most platforms set this for you automatically |
   | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | From step 1 — `DB_PORT` is `3306` by default for MySQL |
   | `JWT_SECRET` | A long, random string — generate with `openssl rand -base64 48` |
   | `JWT_EXPIRES_IN` | e.g. `7d` |
   | `GEMINI_API_KEY` | From Google AI Studio |
   | `GEMINI_MODEL` | e.g. `gemini-1.5-flash` |
   | `CLIENT_URL` | Your deployed frontend's exact origin, e.g. `https://insightai.vercel.app` — required for CORS to work |
   | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | Optional, sensible defaults are baked in |

4. The app calls `validateEnv()` at startup and will refuse to boot with a clear message if any required variable is missing — check your deploy logs first if the service won't start.
5. `app.set('trust proxy', 1)` is already set in `server.js`, which is required for the rate limiter and `req.ip` to work correctly behind a reverse proxy (which is how virtually every PaaS routes traffic).
6. Run the seed script once against production (from your local machine with production `DB_*` vars set, or a one-off job on the platform):
   ```bash
   npm run seed
   ```
   **Change the default admin password immediately after first login in production.**

## 3. Frontend (static build)

1. **Build command:** `npm install && npm run build` (from `frontend/`) — outputs to `frontend/dist/`
2. **Publish directory:** `frontend/dist`
3. Since the frontend calls `/api/...` (see `frontend/src/services/api.js`, `baseURL: '/api'`), you have two options in production:
   - **Same-domain reverse proxy:** configure your static host (Vercel/Netlify rewrites, or an Nginx config) to proxy `/api/*` to your backend URL. This keeps the frontend code unchanged.
   - **Cross-origin:** set `baseURL` in `api.js` to your full backend URL (e.g. `https://insightai-api.onrender.com/api`) and ensure `CLIENT_URL` on the backend matches your frontend's origin exactly for CORS.
4. No frontend environment variables are required for a basic deploy — everything backend-related is proxied or hardcoded to `/api` as described above.

## 4. Post-deploy checklist

- [ ] `GET https://your-backend/api/health` returns `200`
- [ ] Register a new account end-to-end through the deployed frontend
- [ ] Upload the sample dataset and confirm the Dashboard renders KPIs and charts
- [ ] Confirm `GEMINI_API_KEY` works by asking the AI Assistant a question
- [ ] Try **Ask in SQL** mode in the AI Assistant — this exercises the CTE-based dataset scoping, which requires MySQL 8.0+ to work at all; if it errors with a syntax error near `WITH`, your MySQL instance is likely running 5.7 and needs upgrading
- [ ] Log in as the seeded admin and **change the default password**
- [ ] Confirm PDF report generation and download work (some hosts use ephemeral/read-only filesystems — see note below)
- [ ] Set `NODE_ENV=production` so `helmet`, rate limiting, and reduced error verbosity are all active

## 5. Notes on file storage

`backend/generated_reports/` stores generated PDFs on local disk. This works fine on a traditional VPS or any host with persistent disk, but **platforms with ephemeral filesystems (e.g. most serverless/container platforms on redeploy) will lose these files on restart.** For a production deployment beyond a portfolio demo, swap `reportService.js`'s `fs.writeFileSync`/`createWriteStream` calls for an object storage upload (S3, Cloudflare R2, or similar) and store the resulting URL in `reports.file_path` instead of a local filename.

## 6. Scaling notes

- The `mysql2` pool in `backend/config/db.js` is already configured with `connectionLimit: 20` — tune this against your MySQL plan's max-connections limit if you scale to multiple backend instances.
- CSV ingestion batches inserts in chunks of 500 rows (`backend/services/ingestionService.js`) — this is safe well beyond the 3,000-row sample dataset, but very large files (100k+ rows) would benefit from a background job queue instead of processing synchronously inside the upload request.
- The Gemini calls in `geminiService.js` are synchronous per-request; under heavy concurrent AI usage, consider adding a queue or per-user rate limit on `/api/ai/*` specifically (the general `/api` limiter already applies, but a dedicated one would protect your Gemini quota).
- `innodb_autoinc_lock_mode` (a MySQL server setting, default is usually `1` on managed providers) affects how contiguous auto-increment IDs are under concurrent bulk inserts. The app doesn't rely on ID contiguity anywhere it matters (each model does an explicit `SELECT` after writes rather than assuming sequential IDs), so this is safe to leave at your provider's default.
