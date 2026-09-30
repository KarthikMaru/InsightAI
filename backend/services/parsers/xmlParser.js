// File path: backend/services/parsers/xmlParser.js
// Purpose: Parses an uploaded XML file into { headers, rows }.
//
// XXE safety: fast-xml-parser is a tag-tokenizing parser, not a DOM/SAX
// parser wired to a system entity resolver — it never fetches external
// DTDs or resolves <!ENTITY ... SYSTEM "..."> references, so classic XXE
// (local file disclosure / SSRF via entity expansion) is not possible
// through it the way it would be with a naive libxml-based parser.
// Defense in depth: we still strip any <!DOCTYPE ...> prologue before
// parsing, so even a maliciously crafted DOCTYPE/ENTITY block is removed
// and never reaches the parser at all.

const { XMLParser } = require('fast-xml-parser');
const { MAX_ROWS, MAX_COLUMNS } = require('../../config/limits');

function stripDoctype(xmlText) {
  return xmlText.replace(/<!DOCTYPE[^>]*(\[[^\]]*\])?[^>]*>/gi, '');
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Recursively finds the largest array of sibling "record-like" objects
// anywhere in the parsed XML tree — this is how we turn an arbitrary
// <root><items><item>...</item><item>...</item></items></root> shape
// into a flat row list without assuming any particular tag names.
function findBestRecordArray(node, best = { array: null, size: -1 }) {
  if (Array.isArray(node)) {
    const objectItems = node.filter(isPlainObject);
    if (objectItems.length > best.size) {
      best.array = objectItems;
      best.size = objectItems.length;
    }
    node.forEach((child) => findBestRecordArray(child, best));
  } else if (isPlainObject(node)) {
    Object.values(node).forEach((child) => findBestRecordArray(child, best));
  }
  return best.array;
}

function flattenValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    if ('#text' in value) return value['#text'];
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

function parseXmlBuffer(buffer) {
  const raw = stripDoctype(buffer.toString('utf8'));

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false, // never expand XML entities
    allowBooleanAttributes: true,
  });

  let parsed;
  try {
    parsed = parser.parse(raw);
  } catch {
    throw new Error('XML_STRUCTURE_UNREADABLE');
  }

  const records = findBestRecordArray(parsed);
  if (!records || records.length === 0) {
    throw new Error('NO_READABLE_RECORDS');
  }

  const totalRowsSeen = records.length;
  const truncatedRows = totalRowsSeen > MAX_ROWS;
  const limited = records.slice(0, MAX_ROWS);

  const headerSet = new Set();
  limited.slice(0, 500).forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
  let headers = [...headerSet];
  const truncatedColumns = headers.length > MAX_COLUMNS;
  headers = headers.slice(0, MAX_COLUMNS);

  if (headers.length === 0) {
    throw new Error('NO_READABLE_RECORDS');
  }

  const rows = limited.map((r) => {
    const clean = {};
    headers.forEach((h) => {
      clean[h] = flattenValue(r[h]);
    });
    return clean;
  });

  return {
    headers,
    rows,
    truncated: truncatedRows || truncatedColumns,
    totalRowsSeen,
  };
}

module.exports = { parseXmlBuffer };
