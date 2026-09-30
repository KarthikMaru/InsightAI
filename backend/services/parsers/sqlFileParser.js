// File path: backend/services/parsers/sqlFileParser.js
// Purpose: Extracts tabular data from an uploaded .sql file (typically a
// mysqldump-style export) WITHOUT ever executing any SQL against a
// database. This file contains no database connection and calls no SQL
// engine at all — it is a pure string/text scanner that recognizes two
// statement shapes (`CREATE TABLE ...` and `INSERT INTO ... VALUES ...`)
// and turns them into plain JS arrays/objects. Every other statement
// (DROP, DELETE, ALTER, UPDATE, TRUNCATE, CREATE USER, GRANT, SET,
// LOCK/UNLOCK, CALL, etc.) is simply skipped over — it is never run,
// never forwarded to config/db.js, and never reaches mysql2 in any form.
// This is what "uploaded SQL is treated as DATA, not executed" means in
// practice: there is no code path here capable of executing anything.

const { MAX_ROWS, MAX_COLUMNS } = require('../../config/limits');

const DESTRUCTIVE_KEYWORDS = [
  'DROP', 'DELETE', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE', 'CREATE USER',
  'CREATE ROLE', 'SET PASSWORD', 'UPDATE', 'CALL', 'LOAD DATA', 'LOCK TABLES',
  'UNLOCK TABLES', 'RENAME TABLE', 'REPLACE INTO',
];

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments, incl. MySQL /*! ... */ executable comments
    .replace(/--[^\n]*\n/g, '\n') // line comments
    .replace(/^#.*$/gm, ''); // MySQL '#' line comments
}

// Splits `text` on `delimiter` at depth 0, respecting '...' , "..." ,
// `...` quoting and \-escapes, and nested parentheses.
function splitTopLevel(text, delimiter) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (quote) {
      current += ch;
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === delimiter && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) parts.push(current);
  return parts;
}

function unquoteIdentifier(name) {
  return name.trim().replace(/^[`"[]|[`"\]]$/g, '');
}

function parseSqlValue(raw) {
  const v = raw.trim();
  if (/^null$/i.test(v)) return null;
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    return v
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/''/g, "'")
      .replace(/\\\\/g, '\\');
  }
  return v;
}

function parseCreateTable(statement) {
  const match = statement.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?([`"[\]\w.]+)\s*\(([\s\S]*)\)\s*(?:engine|;|$)/i);
  if (!match) return null;
  const tableName = unquoteIdentifier(match[1].split('.').pop());
  const body = match[2];
  const lines = splitTopLevel(body, ',');
  const columns = [];
  const skipPrefixes = /^(primary\s+key|unique\s+key|unique\s+index|key|index|constraint|foreign\s+key|check)\b/i;
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || skipPrefixes.test(trimmed)) return;
    const colMatch = trimmed.match(/^([`"[\]\w]+)/);
    if (colMatch) columns.push(unquoteIdentifier(colMatch[1]));
  });
  return { tableName, columns };
}

function parseInsert(statement) {
  const match = statement.match(
    /insert\s+into\s+([`"[\]\w.]+)\s*(\(([^)]+)\))?\s*values\s*([\s\S]*)/i
  );
  if (!match) return null;

  const tableName = unquoteIdentifier(match[1].split('.').pop());
  const columnList = match[3]
    ? splitTopLevel(match[3], ',').map((c) => unquoteIdentifier(c))
    : null;

  const valuesBlock = match[4];
  const tuples = [];
  // Extract each ( ... ) tuple at depth 0.
  let depth = 0;
  let quote = null;
  let current = '';
  let inTuple = false;
  for (let i = 0; i < valuesBlock.length; i++) {
    const ch = valuesBlock[i];
    const prev = valuesBlock[i - 1];
    if (quote) {
      current += ch;
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      if (depth === 1) {
        inTuple = true;
        current = '';
        continue;
      }
    }
    if (ch === ')') {
      depth--;
      if (depth === 0 && inTuple) {
        tuples.push(current);
        inTuple = false;
        continue;
      }
    }
    if (inTuple) current += ch;
  }

  const rows = tuples.map((tuple) => splitTopLevel(tuple, ',').map(parseSqlValue));
  return { tableName, columnList, rows };
}

/**
 * Parses a .sql dump buffer into { headers, rows, truncated, totalRowsSeen,
 * tableName, skippedStatementCount }. Picks the table with the most
 * INSERTed rows if the dump defines more than one.
 */
function parseSqlBuffer(buffer) {
  const cleaned = stripComments(buffer.toString('utf8'));
  const statements = splitTopLevel(cleaned, ';').map((s) => s.trim()).filter(Boolean);

  const tableColumns = new Map(); // tableName -> columns[]
  const tableRows = new Map(); // tableName -> array of value-tuples (arrays)
  const tableRowColumns = new Map(); // tableName -> columnList used by INSERTs (may vary)
  let skippedStatementCount = 0;

  statements.forEach((statement) => {
    const upper = statement.toUpperCase();
    const isCreate = /^\s*CREATE\s+TABLE/i.test(statement);
    const isInsert = /^\s*INSERT\s+INTO/i.test(statement);

    if (!isCreate && !isInsert) {
      // Includes DROP/DELETE/ALTER/UPDATE/GRANT/etc — intentionally never
      // acted upon. We only count them for the response summary.
      if (DESTRUCTIVE_KEYWORDS.some((k) => upper.includes(k))) skippedStatementCount++;
      else skippedStatementCount++;
      return;
    }

    if (isCreate) {
      const parsedCreate = parseCreateTable(statement);
      if (parsedCreate && parsedCreate.columns.length > 0) {
        tableColumns.set(parsedCreate.tableName, parsedCreate.columns);
      }
      return;
    }

    if (isInsert) {
      const parsedInsert = parseInsert(statement);
      if (!parsedInsert) return;
      const existingRows = tableRows.get(parsedInsert.tableName) || [];
      tableRows.set(parsedInsert.tableName, existingRows.concat(parsedInsert.rows));
      if (parsedInsert.columnList && !tableRowColumns.has(parsedInsert.tableName)) {
        tableRowColumns.set(parsedInsert.tableName, parsedInsert.columnList);
      }
    }
  });

  if (tableRows.size === 0) {
    throw new Error('NO_READABLE_RECORDS');
  }

  // Pick the table with the most extracted rows.
  let bestTable = null;
  let bestCount = -1;
  tableRows.forEach((rows, tableName) => {
    if (rows.length > bestCount) {
      bestTable = tableName;
      bestCount = rows.length;
    }
  });

  const rawRows = tableRows.get(bestTable);
  let headers = tableRowColumns.get(bestTable) || tableColumns.get(bestTable);
  if (!headers) {
    const width = Math.max(...rawRows.map((r) => r.length));
    headers = Array.from({ length: width }, (_, i) => `column_${i + 1}`);
  }
  const truncatedColumns = headers.length > MAX_COLUMNS;
  headers = headers.slice(0, MAX_COLUMNS);

  const totalRowsSeen = rawRows.length;
  const truncatedRows = totalRowsSeen > MAX_ROWS;
  const limited = rawRows.slice(0, MAX_ROWS);

  const rows = limited.map((tuple) => {
    const clean = {};
    headers.forEach((h, i) => {
      clean[h] = tuple[i] === undefined ? null : tuple[i];
    });
    return clean;
  });

  return {
    headers,
    rows,
    truncated: truncatedRows || truncatedColumns,
    totalRowsSeen,
    tableName: bestTable,
    skippedStatementCount,
  };
}

module.exports = { parseSqlBuffer };
