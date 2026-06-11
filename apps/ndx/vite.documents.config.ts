import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: "src/documents_front",
  base: "/docs/",
  publicDir: path.resolve(rootDir, "assets"),
  build: {
    outDir: "../../dist/documents_front",
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
