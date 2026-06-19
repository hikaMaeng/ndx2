import express from "express";
import { serviceDomain, type NDXLogger } from "ndx/common";
import { agentServerDomain } from "ndx/agent/init";
import { readAgentRuntimeSettings } from "ndx/agent/runtime-settings";
import { runSelfcheckOnce } from "ndx/agent/selfcheck";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NDXDatabase } from "ndx/agent/init";
import type { NDXAgentResourceResolver } from "ndx/common";
import { NDX_CONTAINER_NDX_HOME, NDX_CONTAINER_USER_HOME } from "ndx/common/server-path";
import { attachSessionRoutes } from "./agent/index.js";
import { createAgentServerResourceResolver } from "./resource/index.js";
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
  const documentsFrontDir = path.resolve(serverDir, "../documents_front");
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
  attachAgentWebRoutes(app, {
    database: options.database,
    sessionSocketPath,
    version: agentVersion,
    logger: options.webLogger,
    resource
  });
  if (options.database && process.env.NDX_SELFCHECK_SCHEDULER !== "0") {
    startSelfcheckScheduler(options.database, options.webLogger);
  }

  app.use("/assets/i18n", express.static(path.join(NDX_CONTAINER_NDX_HOME, "i18n")));
  app.use("/assets/i18n", express.static(path.join(bundledAssetsDir, "i18n")));
  app.use("/assets", express.static(bundledAssetsDir));
  app.use("/docs", express.static(documentsFrontDir));
  app.get("/docs/{*path}", (_request, response) => {
    response.sendFile(path.join(documentsFrontDir, "index.html"));
  });
  app.use(express.static(webclientFrontDir));
  app.get("/{*path}", (_request, response) => {
    response.sendFile(path.join(webclientFrontDir, "index.html"));
  });

  return app;
}

function startSelfcheckScheduler(database: NDXDatabase, logger?: NDXLogger): void {
  let running = false;
  let nextRunAt = 0;
  const interval = setInterval(() => {
    void (async () => {
      if (running || Date.now() < nextRunAt) return;
      const settings = await readAgentRuntimeSettings(NDX_CONTAINER_USER_HOME);
      const selfcheck = settings.selfcheck;
      if (!selfcheck?.enabled || !selfcheck.model) {
        nextRunAt = Date.now() + 60_000;
        return;
      }
      running = true;
      nextRunAt = Date.now() + selfcheck.defaultIntervalMs;
      try {
        logger?.info("selfcheck.scheduler.run.start", { model: selfcheck.model });
        await runSelfcheckOnce(database, {
          userHome: NDX_CONTAINER_USER_HOME,
          batchSize: selfcheck.defaultBatchSize,
          maxLlmAnalyses: selfcheck.maxLlmAnalysesPerRun,
          maxEvidenceChars: selfcheck.maxEvidenceChars
        });
        logger?.info("selfcheck.scheduler.run.complete");
      } catch (error) {
        logger?.warn("selfcheck.scheduler.run.failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        running = false;
      }
    })();
  }, 60_000);
  interval.unref?.();
}
