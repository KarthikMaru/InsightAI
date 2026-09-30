// File path: frontend/src/services/aiService.js
// Purpose: API calls for the AI assistant, automated insights, and
// natural-language-to-SQL features.

import api from './api';

const aiService = {
  chat: async (datasetId, question) => {
    const { data } = await api.post('/ai/chat', { datasetId, question });
    return data;
  },

  textToSql: async (datasetId, question) => {
    const { data } = await api.post('/ai/text-to-sql', { datasetId, question });
    return data;
  },

  generateInsights: async (datasetId) => {
    const { data } = await api.post('/ai/generate-insights', { datasetId });
    return data.insights;
  },

  getCachedInsights: async (datasetId) => {
    const { data } = await api.get(`/ai/insights?datasetId=${datasetId}`);
    return data; // { insights, isStale, datasetUpdatedAt } — isStale flags edits since generation
  },

  getHistory: async (datasetId) => {
    const { data } = await api.get(`/ai/history?datasetId=${datasetId}`);
    return data.history;
  },
};

export default aiService;
