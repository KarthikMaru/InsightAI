// File path: backend/services/salesShapeAdapter.js
// Purpose: Bridges the new format-agnostic parsers (CSV/JSON/Excel/XML/
// SQL — see services/parsers/) to the ORIGINAL Superstore-specific
// ingestion path (services/ingestionService.js + the sales_records
// table), so that a dataset happening to have the classic Order ID /
// Order Date / Customer Name / ... columns keeps populating the same
// tables the original Dashboard/Analytics/Reports pages read from —
// regardless of which file format it arrived in. This is what makes
// "the existing Superstore sample dataset must continue to work" true
// without special-casing CSV.
//
// Reuses the exact header-normalization/date/number parsing rules from
// the original services/csvService.js so behavior is identical to
// before for anything shaped like sales data.

const { REQUIRED_COLUMNS, normalizeHeader, parseDate, parseNumber } = require('./csvService');

/**
 * @param {string[]} headers - raw column headers as parsed
 * @param {object[]} rows - raw row objects keyed by those headers
 * @returns {null | { records: object[], errors: object[], totalRowsSeen: number }}
 *   null if the headers don't cover every required sales column.
 */
function detectAndConvertSalesRows(headers, rows) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const missingColumns = Object.keys(REQUIRED_COLUMNS).filter((col) => !normalizedHeaders.includes(col));
  if (missingColumns.length > 0) return null;

  const MAX_ERROR_SAMPLES = 25;
  const records = [];
  const errors = [];

  rows.forEach((row, index) => {
    const rowIndex = index + 1;
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
      if (errors.length < MAX_ERROR_SAMPLES) errors.push({ row: rowIndex, issues: rowErrors });
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
  });

  return { records, errors, totalRowsSeen: rows.length };
}

module.exports = { detectAndConvertSalesRows };
