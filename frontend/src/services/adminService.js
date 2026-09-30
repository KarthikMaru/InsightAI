// File path: frontend/src/services/adminService.js
// Purpose: API calls for the Admin Dashboard.

import api from './api';

const adminService = {
  getStats: async () => {
    const { data } = await api.get('/admin/stats');
    return data.stats;
  },
  getUsers: async (page = 1) => {
    const { data } = await api.get(`/admin/users?page=${page}`);
    return data.users;
  },
  getDatasets: async (page = 1) => {
    const { data } = await api.get(`/admin/datasets?page=${page}`);
    return data.datasets;
  },
  getActivities: async () => {
    const { data } = await api.get('/admin/activities');
    return data.activities;
  },
};

export default adminService;
