import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    proxy: {
      // ── WebSocket — forward /ws/* as-is to FastAPI ───────────────────────
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
        changeOrigin: true,
      },
      // ── REST API — forward /api/* as-is to FastAPI ───────────────────────
      // NOTE: NO rewrite — backend routes are already prefixed with /api
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      // ── Health check ─────────────────────────────────────────────────────
      "/health": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});