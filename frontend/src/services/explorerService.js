// File path: frontend/src/services/explorerService.js
// Purpose: API calls for the Data Explorer — paginated/sortable/
// searchable/filterable sales records, plus CSV export.

import api from './api';

const explorerService = {
  getRecords: async (datasetId, { page, pageSize, search, sortBy, sortDir, category, region }) => {
    const params = new URLSearchParams({
      page: page || 1,
      pageSize: pageSize || 20,
      sortBy: sortBy || 'order_date',
      sortDir: sortDir || 'desc',
    });
    if (search) params.append('search', search);
    if (category) params.append('category', category);
    if (region) params.append('region', region);

    const { data } = await api.get(`/datasets/${datasetId}/records?${params.toString()}`);
    return data;
  },

  // Also JWT-protected, so export via the authenticated axios instance
  // and trigger a browser download rather than a plain <a href>.
  export: async (datasetId, filters, datasetName = 'export') => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.category) params.append('category', filters.category);
    if (filters.region) params.append('region', filters.region);

    const response = await api.get(`/datasets/${datasetId}/records/export?${params.toString()}`, {
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
};

export default explorerService;
