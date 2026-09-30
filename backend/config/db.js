// File path: backend/config/db.js
// Purpose: Centralized MySQL connection pool used across the app.
//
// Design notes for anyone diffing this against a PostgreSQL version:
//   - `decimalNumbers: true` makes mysql2 return DECIMAL/NUMERIC columns
//     (sales, profit, discount, and all SUM()/AVG() aggregates over them)
//     as JS numbers instead of strings. Without this, every currency
//     figure returned from the database would be a string and break
//     `.toFixed()` calls and Recharts numeric axes on the frontend.
//   - We use `pool.query()` (client-side placeholder substitution) rather
//     than `pool.execute()` (server-side prepared statements) everywhere.
//     mysql2's `execute()` has a well-known limitation where MySQL cannot
//     use a placeholder for `LIMIT`/`OFFSET` in a prepared statement in
//     older server versions; `query()` sidesteps this entirely and is
//     still fully parameterized/escaped, so there's no SQL injection
//     trade-off — just a compatibility one.
//   - `query()` here returns `{ rows, insertId, affectedRows }` so most
//     call sites that used to destructure `{ rows }` under `pg` keep
//     working unchanged for SELECT statements. For INSERT/UPDATE/DELETE,
//     `rows` is an empty array and `insertId`/`affectedRows` are populated
//     instead (MySQL has no `RETURNING` clause, unlike PostgreSQL).

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: false,
});

/**
 * Normalizes mysql2's return shape so call sites can consistently do
 * `const { rows } = await query(sql, params)`.
 *
 * - SELECT ... -> result is an array of row objects -> { rows: [...] }
 * - INSERT/UPDATE/DELETE -> result is a ResultSetHeader object ->
 *   { rows: [], insertId, affectedRows }
 */
async function query(sql, params = []) {
  const [result] = await pool.query(sql, params);
  if (Array.isArray(result)) {
    return { rows: result };
  }
  return { rows: [], insertId: result.insertId, affectedRows: result.affectedRows };
}

/**
 * Gets a single dedicated connection for multi-statement transactions
 * (BEGIN/COMMIT/ROLLBACK must happen on the same connection, not the pool).
 * Callers MUST call connection.release() in a `finally` block.
 *
 * Returns an object with the same `{ rows, insertId, affectedRows }`
 * query() shape as above, plus transaction control methods.
 */
async function getConnection() {
  const connection = await pool.getConnection();
  return {
    query: async (sql, params = []) => {
      const [result] = await connection.query(sql, params);
      if (Array.isArray(result)) return { rows: result };
      return { rows: [], insertId: result.insertId, affectedRows: result.affectedRows };
    },
    beginTransaction: () => connection.beginTransaction(),
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    release: () => connection.release(),
  };
}

module.exports = { pool, query, getConnection };
