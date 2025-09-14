// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,             // <— prevents Vite from jumping to 5177, 518x
    open: true,
    proxy: {
      "/api":     { target: "http://localhost:5000", changeOrigin: true },
      "/uploads": { target: "http://localhost:5000", changeOrigin: true },
    },
  },
});
