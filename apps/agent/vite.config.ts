import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: "src/front",
  publicDir: path.resolve(rootDir, "assets"),
  build: {
    outDir: "../../dist/front",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      "/health": "http://localhost:18080",
      "/api/session": "http://localhost:18080",
      "/api": "http://localhost:18080",
      "/session": {
        target: "ws://localhost:18080",
        ws: true
      }
    }
  }
});
