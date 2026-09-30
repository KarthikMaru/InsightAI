// File path: backend/tests/csvHelpers.test.js
// Purpose: Unit tests for the pure helper functions used during CSV
// ingestion validation — header normalization, date parsing, and number
// parsing. These run without a database or the csv-parser stream.

const { normalizeHeader, parseDate, parseNumber } = require('../services/csvService');

describe('normalizeHeader', () => {
  test('lowercases and trims', () => {
    expect(normalizeHeader('  Order ID  ')).toBe('order id');
  });

  test('converts underscores to spaces', () => {
    expect(normalizeHeader('Customer_Name')).toBe('customer name');
  });

  test('collapses multiple spaces', () => {
    expect(normalizeHeader('Order   Date')).toBe('order date');
  });
});

describe('parseDate', () => {
  test('parses MM/DD/YYYY format', () => {
    const date = parseDate('11/24/2024');
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(10); // 0-indexed: November
    expect(date.getDate()).toBe(24);
  });

  test('parses ISO YYYY-MM-DD format', () => {
    const date = parseDate('2024-01-15');
    expect(date.getFullYear()).toBe(2024);
  });

  test('returns null for garbage input', () => {
    expect(parseDate('not a date')).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(parseDate('')).toBeNull();
  });
});

describe('parseNumber', () => {
  test('parses a plain number', () => {
    expect(parseNumber('123.45')).toBe(123.45);
  });

  test('strips dollar signs and commas', () => {
    expect(parseNumber('$1,234.56')).toBe(1234.56);
  });

  test('returns NaN for empty input', () => {
    expect(Number.isNaN(parseNumber(''))).toBe(true);
  });

  test('returns NaN for non-numeric text', () => {
    expect(Number.isNaN(parseNumber('abc'))).toBe(true);
  });
});
