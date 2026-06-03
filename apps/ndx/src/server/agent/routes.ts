import type express from "express";
import type { NDXLogger } from "ndx/common";

export function attachSessionRoutes(app: express.Express, logger?: NDXLogger) {
  app.use((request, response, next) => {
    if (request.path.startsWith("/api/session/")) {
      response.setHeader("Access-Control-Allow-Origin", "*");
      logger?.info("agent.session_http.request", { method: request.method, path: request.path });
    }
    next();
  });

  const health = (_request: express.Request, response: express.Response) => {
    logger?.debug("agent.session_http.health");
    response.json({
      status: "ok",
      service: "agent",
      surface: "session"
    });
  };

  app.get("/api/session/health", health);
}
