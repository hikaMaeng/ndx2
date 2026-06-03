import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function createApp() {
  const app = express();
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const frontDir = path.resolve(serverDir, "../front");

  const health = (_request: express.Request, response: express.Response) => {
    response.json({
      status: "ok",
      service: "__SERVICE_NAME__"
    });
  };

  app.get("/health", health);
  app.get("/api/health", health);

  app.use(express.static(frontDir));
  app.get("/{*path}", (_request, response) => {
    response.sendFile(path.join(frontDir, "index.html"));
  });

  return app;
}
