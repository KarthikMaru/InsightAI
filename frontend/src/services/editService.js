// File path: frontend/src/services/editService.js
// Purpose: API calls for the Dataset Editor (row/column CRUD) and for
// "Create Dataset" (manual schema creation). Works against the same
// generic dataset_columns/dataset_rows tables that power Upload/
// Dashboard/Data Explorer — a dataset created or edited here is
// immediately usable everywhere else in the app.

import api from './api';

const editService = {
  createManual: async (name, columns) => {
    const { data } = await api.post('/datasets/manual', { name, columns });
    return data;
  },

  generateWithAi: async (prompt, rowCount, name) => {
    const { data } = await api.post('/datasets/generate-ai', { prompt, rowCount, name });
    return data;
  },

  addRow: async (datasetId, values) => {
    const { data } = await api.post(`/datasets/${datasetId}/rows`, { values });
    return data;
  },

  updateRow: async (datasetId, rowId, values) => {
    const { data } = await api.put(`/datasets/${datasetId}/rows/${rowId}`, { values });
    return data;
  },

  deleteRow: async (datasetId, rowId) => {
    const { data } = await api.delete(`/datasets/${datasetId}/rows/${rowId}`);
    return data;
  },

  duplicateRow: async (datasetId, rowId) => {
    const { data } = await api.post(`/datasets/${datasetId}/rows/${rowId}/duplicate`);
    return data;
  },

  addColumn: async (datasetId, name, dataType) => {
    const { data } = await api.post(`/datasets/${datasetId}/columns`, { name, dataType });
    return data;
  },

  renameColumn: async (datasetId, columnName, newName) => {
    const { data } = await api.patch(`/datasets/${datasetId}/columns/${encodeURIComponent(columnName)}/rename`, { newName });
    return data;
  },

  previewTypeChange: async (datasetId, columnName, newType) => {
    const { data } = await api.get(
      `/datasets/${datasetId}/columns/${encodeURIComponent(columnName)}/type-preview?newType=${encodeURIComponent(newType)}`
    );
    return data.preview;
  },

  changeColumnType: async (datasetId, columnName, newType, confirmed) => {
    const { data } = await api.patch(`/datasets/${datasetId}/columns/${encodeURIComponent(columnName)}/type`, { newType, confirmed });
    return data;
  },

  deleteColumn: async (datasetId, columnName) => {
    const { data } = await api.delete(`/datasets/${datasetId}/columns/${encodeURIComponent(columnName)}`);
    return data;
  },

  reorderColumns: async (datasetId, orderedNames) => {
    const { data } = await api.patch(`/datasets/${datasetId}/columns/reorder`, { orderedNames });
    return data;
  },

  proposeAiModification: async (datasetId, instruction) => {
    const { data } = await api.post(`/datasets/${datasetId}/ai-modify/propose`, { instruction });
    return data;
  },

  applyAiModification: async (datasetId, token) => {
    const { data } = await api.post(`/datasets/${datasetId}/ai-modify/apply`, { token });
    return data;
  },

  cancelAiModification: async (datasetId, token) => {
    const { data } = await api.delete(`/datasets/${datasetId}/ai-modify/${token}`);
    return data;
  },
};

export const EDITABLE_TYPES = ['Text', 'Integer', 'Decimal', 'Boolean', 'Date', 'DateTime'];

export default editService;
