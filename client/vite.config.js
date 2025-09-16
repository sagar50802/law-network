import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/', // ensures relative paths in production
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    open: true,
    proxy: {
     
      "/api": {
        target:  'https://law-network-api.onrender.com',
        changeOrigin: true,
      },
      "/uploads": {
        target:  'https://law-network-api.onrender.com',
        changeOrigin: true,
      },
    },
  },
});
