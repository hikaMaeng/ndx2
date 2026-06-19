import type express from "express";
import {
  getWebSelfcheck,
  listWebSelfcheck,
  listWebSelfcheckCandidates,
  listWebSelfcheckCursors,
  listWebSelfcheckRuns,
  runWebSelfcheck,
  updateWebSelfcheckStatus
} from "ndx/webclient/server";
import { NDX_AGENT_WEB_API, type NDXAgentWebRunSelfcheckRequest, type NDXAgentWebSelfcheckStatus, type NDXAgentWebUpdateSelfcheckRequest } from "ndx/webclient/common";
import type { NDXDatabase } from "ndx/agent/init";
import type { NDXLogger } from "ndx/common";
import { NDX_CONTAINER_USER_HOME } from "ndx/common/server-path";

export function attachAgentWebSelfcheckRoutes(app: express.Express, database?: NDXDatabase, logger?: NDXLogger) {
  app.get(NDX_AGENT_WEB_API.selfcheck, async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database is not configured." });
        return;
      }
      response.json(await listWebSelfcheck(database, {
        status: queryString(request.query.status),
        subjectkind: queryString(request.query.subjectkind),
        subjectname: queryString(request.query.subjectname),
        limit: queryNumber(request.query.limit)
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get(NDX_AGENT_WEB_API.selfcheckCandidates, async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database is not configured." });
        return;
      }
      response.json(await listWebSelfcheckCandidates(database, queryNumber(request.query.limit)));
    } catch (error) {
      next(error);
    }
  });

  app.get(NDX_AGENT_WEB_API.selfcheckCursors, async (_request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database is not configured." });
        return;
      }
      response.json(await listWebSelfcheckCursors(database));
    } catch (error) {
      next(error);
    }
  });

  app.get(NDX_AGENT_WEB_API.selfcheckRuns, async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database is not configured." });
        return;
      }
      response.json(await listWebSelfcheckRuns(database, queryNumber(request.query.limit)));
    } catch (error) {
      next(error);
    }
  });

  app.post(NDX_AGENT_WEB_API.selfcheckRun, async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database is not configured." });
        return;
      }
      const body = request.body as Partial<NDXAgentWebRunSelfcheckRequest>;
      const mode = body.mode === "extract" || body.mode === "analyze" || body.mode === "all" ? body.mode : "all";
      logger?.info("web.selfcheck.run.start", { mode });
      response.json(await runWebSelfcheck(database, NDX_CONTAINER_USER_HOME, {
        mode,
        batchSize: typeof body.batchSize === "number" ? body.batchSize : undefined,
        maxLlmAnalyses: typeof body.maxLlmAnalyses === "number" ? body.maxLlmAnalyses : undefined
      }));
      logger?.info("web.selfcheck.run.complete", { mode });
    } catch (error) {
      if (error instanceof Error && /selfcheck analysis model/i.test(error.message)) {
        response.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  app.get("/api/agent/selfcheck/:selfcheckid", async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database is not configured." });
        return;
      }
      response.json(await getWebSelfcheck(database, request.params.selfcheckid));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/agent/selfcheck/:selfcheckid", async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database is not configured." });
        return;
      }
      const body = request.body as Partial<NDXAgentWebUpdateSelfcheckRequest>;
      if (!isSelfcheckStatus(body.status)) {
        response.status(400).json({ error: "valid selfcheck status is required." });
        return;
      }
      response.json(await updateWebSelfcheckStatus(database, request.params.selfcheckid, body.status));
    } catch (error) {
      next(error);
    }
  });
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function queryNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isSelfcheckStatus(value: unknown): value is NDXAgentWebSelfcheckStatus {
  return value === "open" || value === "reviewing" || value === "accepted" || value === "dismissed" || value === "resolved";
}
