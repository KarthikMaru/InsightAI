// File path: backend/config/limits.js
// Purpose: Single source of truth for upload/ingestion safety limits, so
// the multer middleware, every format parser, and the generic ingestion
// service all agree on the same caps. Uploaded files are untrusted input
// (arbitrary CSV/JSON/Excel/XML/SQL from any user), so these limits exist
// to bound memory use, row-explosion, and DB write volume regardless of
// what a malicious or malformed file contains.

module.exports = {
  // Hard cap on the raw uploaded file size (bytes). Applied by multer
  // before any parser ever sees the buffer.
  MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024, // 25 MB

  // Hard cap on how many data rows we will ever ingest/profile from a
  // single dataset, regardless of format. Files with more rows are
  // truncated (not rejected) and the response says so — this keeps
  // profiling, in-memory stats, and MySQL inserts bounded.
  MAX_ROWS: 50000,

  // Hard cap on the number of columns we will profile/store per dataset.
  // Extremely wide files (e.g. malformed CSV) are truncated to this many
  // columns.
  MAX_COLUMNS: 200,

  // Sample values shown per column in the profile / sent to the AI.
  SAMPLE_VALUES_PER_COLUMN: 5,

  // When building the "representative sample" of rows sent to the AI
  // (never the full dataset), cap it to this many rows.
  AI_SAMPLE_ROWS: 25,

  // Cap on distinct categories returned per categorical column before
  // grouping the rest under "Other" in frequency breakdowns.
  MAX_CATEGORIES: 20,
};
