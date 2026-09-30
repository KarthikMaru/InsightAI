// File path: frontend/src/services/datasetService.js
// Purpose: API calls for dataset upload, sample loading, listing, detail,
// and deletion. Upload now accepts CSV, JSON, Excel (.xlsx/.xls), XML,
// and SQL — not just CSV — and the response includes the auto-generated
// profile plus which pipeline (`datasetType`: 'sales' | 'generic') the
// file was routed through.

import api from './api';

export const ACCEPTED_UPLOAD_EXTENSIONS = '.csv,.json,.xlsx,.xls,.xml,.sql';

const datasetService = {
  upload: async (file, name, onUploadProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    const { data } = await api.post('/datasets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
    return data;
  },

  useSample: async () => {
    const { data } = await api.post('/datasets/sample');
    return data;
  },

  list: async () => {
    const { data } = await api.get('/datasets');
    return data.datasets;
  },

  getById: async (id) => {
    const { data } = await api.get(`/datasets/${id}`);
    return data;
  },

  remove: async (id) => {
    const { data } = await api.delete(`/datasets/${id}`);
    return data;
  },

  rename: async (id, name) => {
    const { data } = await api.patch(`/datasets/${id}`, { name });
    return data;
  },

  duplicate: async (id) => {
    const { data } = await api.post(`/datasets/${id}/duplicate`);
    return data;
  },
};

export default datasetService;
