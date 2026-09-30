// File path: backend/services/exportService.js
// Purpose: Converts a dataset's CURRENT rows (post any edits) into a
// downloadable file in the format the user asks for. Always reflects
// the live database state — there is no separate "export snapshot"
// stored anywhere, so editing a dataset and then exporting it always
// contains the latest saved data (per the "export must contain the
// latest saved dataset" requirement).

const XLSX = require('xlsx');
const { XMLBuilder } = require('fast-xml-parser');
const { escapeCsvCell } = require('../utils/csvSafety');

function toCSV(headers, records) {
  const rows = records.map((r) => headers.map((h) => escapeCsvCell(r[h])).join(','));
  return [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
}

function toJSON(records) {
  return JSON.stringify(records, null, 2);
}

function toExcelBuffer(headers, records) {
  const sheetData = records.map((r) => {
    const row = {};
    headers.forEach((h) => { row[h] = r[h] === null || r[h] === undefined ? '' : r[h]; });
    return row;
  });
  const worksheet = XLSX.utils.json_to_sheet(sheetData, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function toXML(headers, records) {
  const builder = new XMLBuilder({ format: true, ignoreAttributes: true });
  const obj = {
    records: {
      record: records.map((r) => {
        const clean = {};
        headers.forEach((h) => { clean[h] = r[h] === null || r[h] === undefined ? '' : r[h]; });
        return clean;
      }),
    },
  };
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(obj);
}

// SQL export produces a CREATE TABLE + INSERT statements dump — this is
// OUTPUT only (a file the user downloads to import elsewhere); nothing
// in this app ever executes it, so it carries none of the risk an
// uploaded .sql file does.
function sqlEscape(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function sqlColumnType(inferredType) {
  switch (inferredType) {
    case 'integer': return 'INT';
    case 'float': return 'DECIMAL(18,4)';
    case 'boolean': return 'BOOLEAN';
    case 'date': return 'DATE';
    case 'datetime': return 'DATETIME';
    default: return 'TEXT';
  }
}

function toSQL(tableName, columns, records) {
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() || 'dataset';
  const columnDefs = columns.map((c) => `  \`${c.name}\` ${sqlColumnType(c.inferredType)}`).join(',\n');
  const createStatement = `CREATE TABLE \`${safeTable}\` (\n${columnDefs}\n);`;

  const columnNames = columns.map((c) => `\`${c.name}\``).join(', ');
  const insertStatements = records.map((r) => {
    const values = columns.map((c) => sqlEscape(r[c.name])).join(', ');
    return `INSERT INTO \`${safeTable}\` (${columnNames}) VALUES (${values});`;
  });

  return [`-- Exported from InsightAI`, createStatement, '', ...insertStatements].join('\n');
}

const CONTENT_TYPES = {
  csv: 'text/csv',
  json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sql: 'application/sql',
  xml: 'application/xml',
};

module.exports = { toCSV, toJSON, toExcelBuffer, toXML, toSQL, CONTENT_TYPES };
