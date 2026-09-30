// File path: backend/tests/sqlValidator.test.js
// Purpose: Unit tests for the SELECT-only SQL validator that guards the
// natural-language-to-SQL feature. This is the single most
// security-critical piece of logic in the app, so it gets the most
// thorough test coverage and requires no database connection to run.
//
// Converted from PostgreSQL: the `pg_catalog`-specific test is replaced
// with a MySQL-relevant `information_schema` test, the schema-qualified
// test now checks a MySQL-style `database.table` reference, the
// dataset-scoping wrapper assertion checks for `?` instead of `$1`, and a
// new test covers the MySQL-specific `INTO OUTFILE` file-write vector
// that has no PostgreSQL equivalent.

const { validateSelectOnlySql, scopeQueryToDataset } = require('../services/sqlValidator');

describe('validateSelectOnlySql', () => {
  test('accepts a simple safe aggregate query', () => {
    const result = validateSelectOnlySql(
      "SELECT category, SUM(sales) AS total_sales FROM sales_records sr JOIN products p ON p.id = sr.product_id JOIN categories c ON c.id = p.category_id GROUP BY category ORDER BY total_sales DESC LIMIT 1"
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('accepts a simple select with alias and limit', () => {
    const result = validateSelectOnlySql(
      'select sr.order_id, sr.sales, sr.profit from sales_records sr order by sr.sales desc limit 20'
    );
    expect(result.valid).toBe(true);
  });

  test('rejects a DROP TABLE smuggled in via semicolon', () => {
    const result = validateSelectOnlySql('SELECT * FROM sales_records; DROP TABLE users;');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Multiple SQL statements/);
    expect(result.errors.join(' ')).toMatch(/DROP/);
  });

  test('rejects DELETE statements', () => {
    const result = validateSelectOnlySql('DELETE FROM sales_records WHERE id = 1');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/DELETE/);
  });

  test('rejects UPDATE statements', () => {
    const result = validateSelectOnlySql('UPDATE sales_records SET sales = 0');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/UPDATE/);
  });

  test('rejects queries referencing tables outside the whitelist (cross-tenant risk)', () => {
    const result = validateSelectOnlySql('SELECT * FROM users');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/users/);
  });

  test('rejects SQL comments (a classic statement-smuggling vector)', () => {
    const result = validateSelectOnlySql('SELECT * FROM sales_records -- ; DROP TABLE users');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/comments/);
  });

  test('rejects MySQL-style `#` single-line comments', () => {
    const result = validateSelectOnlySql('SELECT * FROM sales_records # ; DROP TABLE users');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/comments/);
  });

  test('rejects schema/database-qualified table references', () => {
    const result = validateSelectOnlySql('SELECT * FROM insightai.sales_records');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/qualified/i);
  });

  test('rejects information_schema access', () => {
    const result = validateSelectOnlySql('SELECT * FROM sales_records sr JOIN information_schema.tables t ON true');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/system schemas/);
  });

  test('rejects MySQL file-write primitives (INTO OUTFILE)', () => {
    const result = validateSelectOnlySql("SELECT * FROM sales_records INTO OUTFILE '/tmp/dump.csv'");
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/OUTFILE/);
  });

  test('rejects CTE / WITH queries', () => {
    const result = validateSelectOnlySql('WITH x AS (SELECT * FROM sales_records) SELECT * FROM x');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/CTE/);
  });

  test('rejects empty input', () => {
    const result = validateSelectOnlySql('');
    expect(result.valid).toBe(false);
  });

  test('does not flag a product name containing a keyword substring (e.g. "Updated")', () => {
    // "Updated" contains "UPDATE" as a substring but not as a whole word —
    // the whole-word regex boundary must not false-positive here.
    const result = validateSelectOnlySql(
      "SELECT p.name FROM sales_records sr JOIN products p ON p.id = sr.product_id WHERE p.name = 'Updated Binder' LIMIT 5"
    );
    expect(result.valid).toBe(true);
  });
});

describe('scopeQueryToDataset', () => {
  test('wraps a query in a dataset-filtering CTE with a parameterized value', () => {
    const { sql, params } = scopeQueryToDataset(
      'SELECT c.name, SUM(sr.sales) FROM sales_records sr JOIN products p ON p.id = sr.product_id JOIN categories c ON c.id = p.category_id GROUP BY c.name',
      42
    );
    expect(sql).toMatch(/WITH sales_records AS/);
    expect(sql).toMatch(/WHERE dataset_id = \?/);
    expect(params).toEqual([42]);
  });

  test('appends a LIMIT if the query does not already have one', () => {
    const { sql } = scopeQueryToDataset('SELECT * FROM sales_records', 1);
    expect(sql).toMatch(/LIMIT 200/);
  });

  test('does not double up LIMIT if already present', () => {
    const { sql } = scopeQueryToDataset('SELECT * FROM sales_records LIMIT 10', 1);
    const matches = sql.match(/LIMIT/g) || [];
    expect(matches.length).toBe(1);
  });
});
