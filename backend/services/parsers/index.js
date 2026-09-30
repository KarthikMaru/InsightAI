// File path: backend/services/parsers/index.js
// Purpose: Detects the uploaded file's type from its extension (and, as a
// fallback, its mimetype) and dispatches to the matching parser. Every
// parser returns the same shape: { headers, rows, truncated, totalRowsSeen }.
// This is the single entry point the generic ingestion pipeline uses —
// it never inspects file content for a specific business schema.

const path = require('path');
const ApiError = require('../../utils/ApiError');
const { parseCsvBuffer } = require('./csvParser');
const { parseJsonBuffer } = require('./jsonParser');
const { parseExcelBuffer } = require('./excelParser');
const { parseXmlBuffer } = require('./xmlParser');
const { parseSqlBuffer } = require('./sqlFileParser');

const EXTENSION_MAP = {
  '.csv': 'csv',
  '.json': 'json',
  '.xlsx': 'excel',
  '.xls': 'excel',
  '.xml': 'xml',
  '.sql': 'sql',
};

const FRIENDLY_ERRORS = {
  NO_READABLE_RECORDS: 'The file contains no readable records.',
  UNABLE_TO_PARSE: 'Unable to parse this file.',
  XML_STRUCTURE_UNREADABLE: 'The XML structure could not be interpreted.',
};

function detectFileType(originalFilename) {
  const ext = path.extname(originalFilename || '').toLowerCase();
  return EXTENSION_MAP[ext] || null;
}

/**
 * @param {Buffer} buffer
 * @param {string} originalFilename
 * @returns {{ fileType: string, headers: string[], rows: object[], truncated: boolean, totalRowsSeen: number, tableName?: string }}
 */
function parseUploadedFile(buffer, originalFilename) {
  const fileType = detectFileType(originalFilename);
  if (!fileType) {
    throw new ApiError(
      400,
      'Unsupported file format. Please upload a CSV, JSON, Excel (.xlsx/.xls), XML, or SQL file.'
    );
  }

  try {
    let parsed;
    switch (fileType) {
      case 'csv':
        parsed = parseCsvBuffer(buffer);
        break;
      case 'json':
        parsed = parseJsonBuffer(buffer);
        break;
      case 'excel':
        parsed = parseExcelBuffer(buffer);
        break;
      case 'xml':
        parsed = parseXmlBuffer(buffer);
        break;
      case 'sql':
        parsed = parseSqlBuffer(buffer);
        break;
      default:
        throw new Error('UNABLE_TO_PARSE');
    }
    return { fileType, ...parsed };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const message = FRIENDLY_ERRORS[err.message] || 'Unable to parse this file.';
    throw new ApiError(400, message);
  }
}

module.exports = { parseUploadedFile, detectFileType };
