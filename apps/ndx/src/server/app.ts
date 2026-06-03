import express from "express";
import { serviceDomain, type NDXLogger } from "ndx/common";
import { agentServerDomain } from "ndx/agent";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NDXDatabase } from "ndx/agent";
import type { NDXAgentResourceResolver } from "ndx/common";
import { NDX_CONTAINER_NDX_HOME } from "ndx/common/server-path";
import { attachSessionRoutes } from "./agent/index.js";
import { createAgentServerResourceResolver } from "./resource/index.js";
import { attachAdminWebRoutes } from "./web/admin/index.js";
import { attachAgentWebRoutes } from "./web/webclient/index.js";

const agentPackage = JSON.parse(
  fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as { version?: unknown };
const agentVersion = typeof agentPackage.version === "string" ? agentPackage.version : "0.0.0";

export type CreateAppOptions = {
  sessionSocketPath?: string;
  database?: NDXDatabase;
  agentLogger?: NDXLogger;
  webLogger?: NDXLogger;
  resource?: NDXAgentResourceResolver;
};

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const webclientFrontDir = path.resolve(serverDir, "../webclient_front");
  const adminFrontDir = path.resolve(serverDir, "../admin_front");
  const bundledAssetsDir = path.resolve(serverDir, "../../assets");
  const sessionSocketPath = options.sessionSocketPath ?? "/session";
  const resource = options.resource ?? createAgentServerResourceResolver({ runtimeAssetsDir: NDX_CONTAINER_NDX_HOME, bundledAssetsDir });

  app.use(express.json({ limit: "128kb" }));

  const health = (_request: express.Request, response: express.Response) => {
    response.json({
      status: "ok",
      service: "ndx",
      version: agentVersion,
      packageName: serviceDomain.packageName,
      surface: agentServerDomain.surface
    });
  };

  app.get("/health", health);
  app.get("/api/health", health);
  attachSessionRoutes(app, options.agentLogger);
  attachAdminWebRoutes(app);
  attachAgentWebRoutes(app, {
    database: options.database,
    sessionSocketPath,
    version: agentVersion,
    logger: options.webLogger,
    resource
  });

  app.use("/assets/i18n", express.static(path.join(NDX_CONTAINER_NDX_HOME, "i18n")));
  app.use("/assets/i18n", express.static(path.join(bundledAssetsDir, "i18n")));
  app.use("/assets", express.static(bundledAssetsDir));
  app.use("/admin", express.static(adminFrontDir));
  app.get("/admin/{*path}", (_request, response) => {
    response.sendFile(path.join(adminFrontDir, "index.html"));
  });
  app.use(express.static(webclientFrontDir));
  app.get("/{*path}", (_request, response) => {
    response.sendFile(path.join(webclientFrontDir, "index.html"));
  });

  return app;
}
