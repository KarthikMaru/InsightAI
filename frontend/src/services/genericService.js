// File path: frontend/src/services/genericService.js
// Purpose: API calls for the general-purpose dataset pipeline — schema
// profile, dynamic Data Explorer records, and dynamic analytics/chart
// suggestions. Used for datasets whose `dataset_type` is 'generic' (any
// upload that isn't Superstore-shaped sales data — see datasetService
// for the 'sales' pipeline, which is unchanged).

import api from './api';

const genericService = {
  getProfile: async (datasetId) => {
    const { data } = await api.get(`/datasets/${datasetId}/profile`);
    return data;
  },

  getAnalytics: async (datasetId) => {
    const { data } = await api.get(`/datasets/${datasetId}/generic-analytics`);
    return data;
  },

  getRecords: async (datasetId, { page, pageSize, search, sortBy, sortDir }) => {
    const params = new URLSearchParams({
      page: page || 1,
      pageSize: pageSize || 20,
      sortDir: sortDir || 'desc',
    });
    if (search) params.append('search', search);
    if (sortBy) params.append('sortBy', sortBy);

    const { data } = await api.get(`/datasets/${datasetId}/generic-records?${params.toString()}`);
    return data;
  },

  export: async (datasetId, { search } = {}, datasetName = 'export') => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);

    const response = await api.get(`/datasets/${datasetId}/generic-records/export?${params.toString()}`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${datasetName.replace(/\s+/g, '_')}_export.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Full-dataset export in any supported format (csv/json/xlsx/sql/xml) —
  // always the CURRENT saved state, including every edit made so far.
  exportAs: async (datasetId, format, datasetName = 'export') => {
    const response = await api.get(`/datasets/${datasetId}/export?format=${format}`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${datasetName.replace(/\s+/g, '_')}.${format}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default genericService;
