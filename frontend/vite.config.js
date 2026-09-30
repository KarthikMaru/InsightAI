import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// File path: frontend/vite.config.js
// Purpose: Vite config with a dev proxy so the SPA can call /api without CORS issues.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
});
