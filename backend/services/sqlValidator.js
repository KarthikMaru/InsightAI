// File path: backend/services/sqlValidator.js
// Purpose: Validates AI-generated SQL before it is ever executed. This is
// the safety boundary between "Gemini wrote some text" and "we ran it
// against the database" — it must be conservative, not clever.
//
// Rules enforced:
//   1. Exactly one statement (no `;` other than an optional trailing one).
//   2. Must start with SELECT (WITH/CTE queries are rejected below to
//      keep the CTE-based dataset-scoping wrapper in scopeQueryToDataset
//      safe and unambiguous — we own the only WITH clause).
//   3. No forbidden keywords anywhere (DML/DDL/admin commands, plus
//      MySQL-specific file/IO primitives), matched as whole words so
//      e.g. a product named "Updated Binder" isn't blocked.
//   4. No SQL comments (`--`, `/* */`, `#`) — a classic injection/
//      obfuscation vector for smuggling a second statement past naive
//      checks. (`#` is a MySQL-specific single-line comment marker that
//      doesn't exist in standard SQL/PostgreSQL, so it gets its own check.)
//   5. No schema/database-qualified identifiers (`mydb.sales_records`,
//      `information_schema...`, `mysql...`, `performance_schema...`,
//      `sys...`) — forces every table reference through the plain name
//      we whitelist and then shadow with a filtered CTE.
//   6. Every table referenced after FROM/JOIN must be in the whitelist.
//
// Converted from PostgreSQL: the forbidden-keyword list now also blocks
// MySQL's file-system primitives (`LOAD_FILE()`, `INTO OUTFILE`, `INTO
// DUMPFILE`, `LOAD DATA`, `HANDLER`) — these have no PostgreSQL
// equivalent and are a MySQL-specific way to read/write files via SQL,
// so they need explicit coverage that the original validator didn't
// require. `pg_catalog`/`public.` checks (PostgreSQL-specific) are
// replaced with MySQL's system schemas and a general schema-qualification
// block.

const FORBIDDEN_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE',
  'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'MERGE', 'CALL', 'COPY',
  'ATTACH', 'DETACH', 'PRAGMA', 'VACUUM', 'REPLACE', 'RENAME',
  'DO', 'LISTEN', 'NOTIFY', 'SET', 'RESET',
  // MySQL-specific dangerous primitives
  'OUTFILE', 'DUMPFILE', 'LOAD_FILE', 'LOAD', 'HANDLER', 'LOCK', 'UNLOCK',
];

const ALLOWED_TABLES = new Set([
  'sales_records', 'products', 'categories', 'customers', 'regions',
]);

function validateSelectOnlySql(rawSql) {
  const errors = [];
  const sql = (rawSql || '').trim();

  if (!sql) {
    return { valid: false, errors: ['Empty query'] };
  }

  // 1. Strip one optional trailing semicolon, then reject any remaining ones.
  const withoutTrailingSemicolon = sql.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    errors.push('Multiple SQL statements are not allowed');
  }

  // 2. Must start with SELECT.
  if (!/^SELECT\b/i.test(withoutTrailingSemicolon.trim())) {
    errors.push('Only SELECT statements are allowed');
  }

  // 3. Forbidden keywords, matched as whole words.
  FORBIDDEN_KEYWORDS.forEach((keyword) => {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
    if (pattern.test(withoutTrailingSemicolon)) {
      errors.push(`Forbidden keyword detected: ${keyword}`);
    }
  });

  // 4. No comments — including MySQL's `#` single-line comment marker.
  if (
    withoutTrailingSemicolon.includes('--') ||
    withoutTrailingSemicolon.includes('/*') ||
    withoutTrailingSemicolon.includes('#')
  ) {
    errors.push('SQL comments are not allowed');
  }

  // 5. No system-schema or schema/database-qualified identifiers.
  if (/\b(information_schema|performance_schema|mysql|sys)\b/i.test(withoutTrailingSemicolon)) {
    errors.push('References to system schemas are not allowed');
  }
  if (/\b(?:FROM|JOIN)\s+[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_]/i.test(withoutTrailingSemicolon)) {
    errors.push('Schema/database-qualified table references are not allowed');
  }

  // 6. Table whitelist — extract identifiers following FROM / JOIN.
  const tableMatches = [...withoutTrailingSemicolon.matchAll(/\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)];
  const referencedTables = tableMatches.map((m) => m[1].toLowerCase());
  const disallowed = referencedTables.filter((t) => !ALLOWED_TABLES.has(t));
  if (disallowed.length > 0) {
    errors.push(`Query references tables outside the allowed set: ${[...new Set(disallowed)].join(', ')}`);
  }

  // 7. Reject CTEs entirely — keeps the dataset-scoping wrapper unambiguous.
  if (/^WITH\b/i.test(withoutTrailingSemicolon.trim())) {
    errors.push('WITH / CTE queries are not supported for natural-language SQL');
  }

  return {
    valid: errors.length === 0,
    errors,
    cleanedSql: withoutTrailingSemicolon.trim(),
  };
}

/**
 * Wraps a validated, table-whitelisted SELECT so that any reference to
 * `sales_records` is transparently scoped to one dataset via a CTE that
 * shadows the real table name. Also enforces a hard row cap.
 *
 * Requires MySQL 8.0+ — Common Table Expressions (the `WITH` clause)
 * were only added in MySQL 8.0.1. This is the same requirement the app's
 * schema already has (JSON columns, etc.), so no additional version
 * constraint is introduced here.
 */
function scopeQueryToDataset(cleanedSql, datasetId) {
  const hasLimit = /\bLIMIT\s+\d+/i.test(cleanedSql);
  const capped = hasLimit ? cleanedSql : `${cleanedSql} LIMIT 200`;

  return {
    sql: `WITH sales_records AS (
      SELECT * FROM sales_records WHERE dataset_id = ?
    )
    ${capped}`,
    params: [datasetId],
  };
}

module.exports = { validateSelectOnlySql, scopeQueryToDataset, ALLOWED_TABLES };
