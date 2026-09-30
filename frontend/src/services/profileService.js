// File path: frontend/src/services/profileService.js
// Purpose: API calls for viewing/updating the profile and changing password.

import api from './api';

const profileService = {
  get: async () => {
    const { data } = await api.get('/auth/profile');
    return data;
  },
  update: async ({ name, businessName, industry }) => {
    const { data } = await api.put('/auth/profile', { name, businessName, industry });
    return data;
  },
  changePassword: async ({ currentPassword, newPassword }) => {
    const { data } = await api.put('/auth/change-password', { currentPassword, newPassword });
    return data;
  },
};

export default profileService;
