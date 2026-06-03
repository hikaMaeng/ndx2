import type express from "express";

export function attachAdminWebRoutes(app: express.Express) {
  app.get("/api/admin/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "ndx",
      surface: "admin"
    });
  });
}
