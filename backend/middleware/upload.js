// File path: backend/middleware/upload.js
// Purpose: Multer configuration for dataset uploads. Files are kept in
// memory (not written to disk) since we parse and discard immediately —
// this also sidesteps any path-traversal risk from an attacker-controlled
// filename, since the name is never used to construct a filesystem path.
//
// Now accepts CSV, JSON, Excel (.xlsx/.xls), XML, and SQL — previously
// CSV-only. The actual parser dispatch (and the authoritative type check)
// happens in services/parsers/index.js by file extension; this filter is
// a fast first pass that also covers common mimetypes browsers send for
// these formats.

const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { MAX_FILE_SIZE_BYTES } = require('../config/limits');

const ALLOWED_EXTENSIONS = /\.(csv|json|xlsx|xls|xml|sql)$/i;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const hasAllowedExtension = ALLOWED_EXTENSIONS.test(file.originalname || '');

  if (!hasAllowedExtension) {
    return cb(new ApiError(400, 'Unsupported file format. Please upload a CSV, JSON, Excel, XML, or SQL file.'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

module.exports = upload;
