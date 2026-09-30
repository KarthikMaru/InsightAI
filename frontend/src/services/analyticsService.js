// File path: frontend/src/services/analyticsService.js
// Purpose: API calls for the analytics engine. Every function takes a
// datasetId plus an optional filters object ({ startDate, endDate,
// category, region }) and builds the query string.

import api from './api';

function toQueryString(datasetId, filters = {}) {
  const params = new URLSearchParams({ datasetId });
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.category) params.append('category', filters.category);
  if (filters.region) params.append('region', filters.region);
  return params.toString();
}

const analyticsService = {
  getFilterOptions: async (datasetId) => {
    const { data } = await api.get(`/analytics/filters?datasetId=${datasetId}`);
    return data;
  },
  getDashboardSummary: async (datasetId, filters) => {
    const { data } = await api.get(`/analytics/dashboard?${toQueryString(datasetId, filters)}`);
    return data;
  },
  getSalesAnalytics: async (datasetId, filters) => {
    const { data } = await api.get(`/analytics/sales?${toQueryString(datasetId, filters)}`);
    return data;
  },
  getProductAnalytics: async (datasetId, filters) => {
    const { data } = await api.get(`/analytics/products?${toQueryString(datasetId, filters)}`);
    return data;
  },
  getCustomerAnalytics: async (datasetId, filters) => {
    const { data } = await api.get(`/analytics/customers?${toQueryString(datasetId, filters)}`);
    return data;
  },
  getRegionAnalytics: async (datasetId, filters) => {
    const { data } = await api.get(`/analytics/regions?${toQueryString(datasetId, filters)}`);
    return data;
  },
};

export default analyticsService;
