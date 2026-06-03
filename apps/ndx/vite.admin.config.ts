import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "src/admin_front",
  base: "/admin/",
  build: {
    outDir: "../../dist/admin_front",
    emptyOutDir: true
  },
  server: {
    port: 5174,
    proxy: {
      "/health": "http://localhost:18080",
      "/api": "http://localhost:18080"
    }
  }
});
