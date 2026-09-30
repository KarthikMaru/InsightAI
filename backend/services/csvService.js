// File path: backend/services/csvService.js
// Purpose: Parses an uploaded CSV buffer, validates its headers and each
// row, and returns clean, typed records ready for ingestion — or a list
// of validation errors if the file doesn't meet requirements.

const { Readable } = require('stream');
const csv = require('csv-parser');

// Canonical columns InsightAI understands. Header matching is
// case-insensitive and tolerant of extra whitespace / underscores.
const REQUIRED_COLUMNS = {
  'order id': 'orderId',
  'order date': 'orderDate',
  'customer name': 'customerName',
  'customer id': 'customerId',
  'product': 'product',
  'category': 'category',
  'region': 'region',
  'quantity': 'quantity',
  'sales': 'sales',
  'profit': 'profit',
  'discount': 'discount',
};

function normalizeHeader(header) {
  return header.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
}

function parseDate(value) {
  // Accepts MM/DD/YYYY, YYYY-MM-DD, or anything Date can parse.
  const trimmed = String(value).trim();
  let date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    const parts = trimmed.split(/[/-]/);
    if (parts.length === 3) {
      // Try MM/DD/YYYY explicitly
      const [a, b, c] = parts.map(Number);
      date = new Date(c, a - 1, b);
    }
  }
  return isNaN(date.getTime()) ? null : date;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const cleaned = String(value).replace(/[$,]/g, '').trim();
  return Number(cleaned);
}

/**
 * Parses a CSV buffer into { headerMap, records, errors, rowCount }.
 * Only the first MAX_ERROR_SAMPLES row errors are collected in detail;
 * the rest are counted so the response stays small.
 */
function parseAndValidateCsv(buffer, { maxRows = 50000 } = {}) {
  return new Promise((resolve, reject) => {
    const records = [];
    const errors = [];
    let headerColumns = null;
    let missingColumns = [];
    let rowIndex = 0;
    const MAX_ERROR_SAMPLES = 25;

    const stream = Readable.from(buffer.toString('utf8'));

    stream
      .pipe(csv())
      .on('headers', (headers) => {
        headerColumns = headers.map(normalizeHeader);
        missingColumns = Object.keys(REQUIRED_COLUMNS).filter(
          (col) => !headerColumns.includes(col)
        );
        if (missingColumns.length > 0) {
          stream.destroy();
        }
      })
      .on('data', (row) => {
        rowIndex += 1;
        if (rowIndex > maxRows) return;

        // Re-key the row using normalized headers -> canonical field names
        const normalizedRow = {};
        Object.entries(row).forEach(([key, value]) => {
          const canonicalKey = REQUIRED_COLUMNS[normalizeHeader(key)];
          if (canonicalKey) normalizedRow[canonicalKey] = value;
        });

        const rowErrors = [];
        const orderDate = parseDate(normalizedRow.orderDate);
        const quantity = parseInt(normalizedRow.quantity, 10);
        const sales = parseNumber(normalizedRow.sales);
        const profit = parseNumber(normalizedRow.profit);
        const discountRaw = parseNumber(normalizedRow.discount);
        const discount = isNaN(discountRaw) ? 0 : discountRaw;

        if (!normalizedRow.orderId) rowErrors.push('Missing Order ID');
        if (!orderDate) rowErrors.push('Invalid or missing Order Date');
        if (!normalizedRow.customerName) rowErrors.push('Missing Customer Name');
        if (!normalizedRow.product) rowErrors.push('Missing Product');
        if (!normalizedRow.category) rowErrors.push('Missing Category');
        if (!normalizedRow.region) rowErrors.push('Missing Region');
        if (isNaN(quantity) || quantity < 0) rowErrors.push('Invalid Quantity');
        if (isNaN(sales)) rowErrors.push('Invalid Sales value');
        if (isNaN(profit)) rowErrors.push('Invalid Profit value');

        if (rowErrors.length > 0) {
          if (errors.length < MAX_ERROR_SAMPLES) {
            errors.push({ row: rowIndex, issues: rowErrors });
          }
          return;
        }

        records.push({
          orderId: String(normalizedRow.orderId).trim(),
          orderDate,
          customerName: String(normalizedRow.customerName).trim(),
          customerId: normalizedRow.customerId ? String(normalizedRow.customerId).trim() : null,
          product: String(normalizedRow.product).trim(),
          category: String(normalizedRow.category).trim(),
          region: String(normalizedRow.region).trim(),
          quantity,
          sales,
          profit,
          discount,
        });
      })
      .on('end', () => {
        if (missingColumns.length > 0) {
          return resolve({
            success: false,
            missingColumns,
            records: [],
            errors: [],
            rowCount: 0,
          });
        }
        resolve({
          success: true,
          missingColumns: [],
          records,
          errors,
          totalRowsSeen: rowIndex,
          rowCount: records.length,
        });
      })
      .on('error', (err) => {
        if (missingColumns.length > 0) {
          return resolve({
            success: false,
            missingColumns,
            records: [],
            errors: [],
            rowCount: 0,
          });
        }
        reject(err);
      });
  });
}

module.exports = { parseAndValidateCsv, REQUIRED_COLUMNS, normalizeHeader, parseDate, parseNumber };
