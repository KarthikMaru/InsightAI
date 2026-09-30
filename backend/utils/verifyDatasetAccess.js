// File path: backend/utils/verifyDatasetAccess.js
// Purpose: Confirms a dataset exists and belongs to the requesting user's
// business (or the requester is an admin). Used by every analytics/report
// endpoint that takes a datasetId, so a user can never query another
// business's data by guessing an id.

const ApiError = require('./ApiError');
const datasetModel = require('../models/datasetModel');
const businessModel = require('../models/businessModel');

async function verifyDatasetAccess(user, datasetId) {
  if (!datasetId) {
    throw new ApiError(400, 'datasetId query parameter is required');
  }

  const dataset = await datasetModel.findById(datasetId);
  if (!dataset) {
    throw new ApiError(404, 'Dataset not found');
  }

  if (user.role !== 'admin') {
    const business = await businessModel.findByUserId(user.id);
    if (!business || dataset.business_id !== business.id) {
      throw new ApiError(403, 'You do not have access to this dataset');
    }
  }

  return dataset;
}

module.exports = verifyDatasetAccess;
