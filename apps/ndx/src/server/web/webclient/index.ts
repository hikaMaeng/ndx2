import type express from "express";
import { attachAgentWebClientStateRoutes } from "./client-state/index.js";
import { attachAgentWebChatRoutes } from "./chat/index.js";
import { attachAgentWebMetadataRoutes } from "./metadata/index.js";
import { attachAgentWebProjectRoutes } from "./projects/index.js";
import { attachAgentWebModelRoutes } from "./web-models/index.js";
import { attachAgentWebSessionRoutes } from "./sessions/index.js";
import type { AttachAgentWebRoutesOptions } from "../common/types.js";
import { attachAgentWebUserRoutes } from "./users/index.js";
import { attachAgentWebWorkspaceRoutes } from "./workspace/index.js";
import { attachAgentWebSettingsRoutes } from "./settings/index.js";

export function attachAgentWebRoutes(app: express.Express, options: AttachAgentWebRoutesOptions) {
  const database = options.database && options.logger ? { ...options.database, logger: options.logger } : options.database;

  app.use("/api/agent", (request, response, next) => {
    const started = Date.now();
    options.logger?.info("web.http.request.start", {
      method: request.method,
      path: request.path,
      query: request.query,
      ip: request.ip
    });
    response.on("finish", () => {
      options.logger?.info("web.http.request.complete", {
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Date.now() - started
      });
    });
    next();
  });

  attachAgentWebMetadataRoutes(app, {
    sessionSocketPath: options.sessionSocketPath,
    version: options.version,
    logger: options.logger
  });
  attachAgentWebUserRoutes(app, database, options.logger, options.resource);
  attachAgentWebWorkspaceRoutes(app, options.logger);
  attachAgentWebSettingsRoutes(app, options.logger, options.resource);
  attachAgentWebProjectRoutes(app, database, options.logger, options.resource);
  attachAgentWebModelRoutes(app, database, options.logger, options.resource);
  attachAgentWebChatRoutes(app, database, options.logger, options.resource);
  attachAgentWebSessionRoutes(app, database, options.logger, options.resource);
  attachAgentWebClientStateRoutes(app, database, options.logger, options.resource);
  app.use("/api/agent", (error: unknown, request: express.Request, _response: express.Response, next: express.NextFunction) => {
    options.logger?.error("web.http.request.failed", {
      method: request.method,
      path: request.path,
      error
    });
    next(error);
  });
}
