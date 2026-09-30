// File path: frontend/src/services/reportService.js
// Purpose: API calls for generating, listing, downloading, and deleting
// PDF reports.

import api from './api';

const reportService = {
  generate: async (datasetId, reportType) => {
    const { data } = await api.post('/reports/generate', { datasetId, reportType });
    return data.report;
  },
  list: async () => {
    const { data } = await api.get('/reports');
    return data.reports;
  },
  // The download route is JWT-protected, so we can't use a plain <a href>
  // (no Authorization header would be sent). Fetch as a blob through the
  // authenticated axios instance instead, then trigger a browser download.
  download: async (report) => {
    const response = await api.get(`/reports/${report.id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${report.report_type}_${report.id}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  remove: async (reportId) => {
    const { data } = await api.delete(`/reports/${reportId}`);
    return data;
  },
};

export default reportService;
