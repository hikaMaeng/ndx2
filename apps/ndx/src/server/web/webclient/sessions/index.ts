import fs from "node:fs/promises";
import path from "node:path";
import type express from "express";
import {
  NDX_AGENT_RESOURCE,
  createNDXAgentResourceResolver,
  normalizeNDXAgentLanguage,
  type NDXAgentResourceResolver
} from "ndx/common";
import {
  createSession,
  getSession,
  listSessionData,
  listSession,
  type NDXModelConfig,
  type NDXSessionDataRow,
  type NDXSessionRow
} from "ndx/agent/session";
import { calculateDetailedContextUsage } from "ndx/agent/contextusage";
import type { NDXDatabase } from "ndx/agent/init";
import { listAvailableTools, toolSchemas } from "ndx/agent/tool";
import { buildTurnMessageParts } from "ndx/agent/turnloop";
import {
  type NDXAgentWebCreateSessionRequest,
  type NDXAgentWebSession,
  type NDXAgentWebSessionData,
  type NDXAgentWebSessionDataResponse,
  type NDXAgentWebSessionsResponse
} from "ndx/webclient/common";
import type { NDXLogger } from "ndx/common";
import { normalizeWorkspaceProjectName, serverContainerUserHome, serverWorkspaceProjectPath, toServerProjectPath } from "ndx/common/server-path";

export function attachAgentWebSessionRoutes(app: express.Express, database?: NDXDatabase, logger?: NDXLogger, resources: NDXAgentResourceResolver = createNDXAgentResourceResolver()) {
  app.get("/api/agent/projects/:projectName/sessions", async (request, response, next) => {
    try {
      const language = requestLanguage(request);
      const projectName = normalizeWorkspaceProjectName(request.params.projectName);
      logger?.debug("web.sessions.list.start", { projectName });
      if (!database) {
        response.status(503).json({ error: resources(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language }) });
        return;
      }

      const body: NDXAgentWebSessionsResponse = {
        sessions: (await listSession(database, projectName)).map(toWebSession)
      };
      response.json(body);
      logger?.debug("web.sessions.list.complete", { projectName, count: body.sessions.length });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agent/projects/:projectName/sessions", async (request, response, next) => {
    try {
      const language = requestLanguage(request);
      const projectName = normalizeWorkspaceProjectName(request.params.projectName);
      logger?.info("web.sessions.create.start", { projectName });
      if (!database) {
        response.status(503).json({ error: resources(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language }) });
        return;
      }

      const body = request.body as Partial<NDXAgentWebCreateSessionRequest>;

      const model: NDXModelConfig =
        body.model && typeof body.model === "object"
          ? (body.model as NDXModelConfig)
          : { type: "openai", model: "gpt-5.4", url: "", token: "", contextsize: 200_000, modalities: ["text"] };
      const stat = await fs.stat(serverWorkspaceProjectPath(projectName)).catch(() => undefined);
      if (!stat?.isDirectory()) {
        response.status(404).json({ error: `Project not found: ${projectName}` });
        return;
      }

      response.status(201).json(
        toWebSession(
          await createSession(database, {
            projectname: projectName,
            model
          })
        )
      );
      logger?.info("web.sessions.create.complete", { projectName });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agent/sessions/:sessionid/data", async (request, response, next) => {
    try {
      const language = requestLanguage(request);
      logger?.debug("web.session_data.list.start", { sessionid: request.params.sessionid });
      if (!database) {
        response.status(503).json({ error: resources(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language }) });
        return;
      }

      const session = await getSession(database, request.params.sessionid);
      if (!session) {
        response.status(404).json({ error: resources(NDX_AGENT_RESOURCE.WEB_SESSION_NOT_FOUND_ERROR, { language }) });
        return;
      }

      const parts = await buildTurnMessageParts(database, session);
      const tools = toolSchemas(await listAvailableTools({ userHome: serverContainerUserHome(), projectHome: toServerProjectPath(session.path) }));
      const usage = calculateDetailedContextUsage(
        [parts.developer, parts.user, ...parts.history].filter((message) => {
          if (!("content" in message)) return true;
          return typeof message.content === "string" ? message.content.trim().length > 0 : Array.isArray(message.content) ? message.content.length > 0 : true;
        }),
        session.model.contextsize,
        "",
        tools
      );
      const body: NDXAgentWebSessionDataResponse = {
        data: (await listSessionData(database, request.params.sessionid)).map(toWebSessionData),
        contextUsage: usage
      };
      response.json(body);
      logger?.debug("web.session_data.list.complete", {
        sessionid: request.params.sessionid,
        count: body.data.length,
        contextTokens: body.contextUsage?.tokens,
        contextsize: body.contextUsage?.contextsize
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agent/sessions/:sessionid/attachments/:dataid/:index", async (request, response, next) => {
    try {
      const language = requestLanguage(request);
      logger?.debug("web.session_attachment.get.start", { sessionid: request.params.sessionid, dataid: request.params.dataid, index: request.params.index });
      if (!database) {
        response.status(503).json({ error: resources(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language }) });
        return;
      }

      const session = await getSession(database, request.params.sessionid);
      if (!session) {
        response.status(404).json({ error: resources(NDX_AGENT_RESOURCE.WEB_SESSION_NOT_FOUND_ERROR, { language }) });
        return;
      }

      const index = Number(request.params.index);
      if (!Number.isInteger(index) || index < 0) {
        response.status(404).end();
        return;
      }

      const result = await database.query<NDXSessionDataRow>(
        `
SELECT dataid, sessionid, type, contents, createdat
FROM sessiondata
WHERE sessionid = $1
  AND dataid::text = $2
LIMIT 1;
`,
        [request.params.sessionid, request.params.dataid]
      );
      const contents = result.rows[0]?.contents;
      const attachments = contents && typeof contents === "object" && Array.isArray((contents as { attachments?: unknown }).attachments)
        ? (contents as { attachments: unknown[] }).attachments
        : [];
      const attachment = attachments[index];
      if (!attachment || typeof attachment !== "object") {
        response.status(404).end();
        return;
      }

      const record = attachment as { kind?: unknown; path?: unknown; mimeType?: unknown; name?: unknown };
      if (record.kind !== "image" || typeof record.path !== "string" || typeof record.mimeType !== "string" || !record.mimeType.toLowerCase().startsWith("image/")) {
        response.status(404).end();
        return;
      }

      const projectHome = toServerProjectPath(session.path);
      const sessionAttachmentDirectory = path.posix.join(projectHome, ".ndx", "sessions", session.sessionid);
      const attachmentPath = path.posix.normalize(record.path.replace(/\\/g, "/"));
      const relative = path.posix.relative(sessionAttachmentDirectory, attachmentPath);
      if (relative.startsWith("..") || path.posix.isAbsolute(relative)) {
        response.status(404).end();
        return;
      }

      const stat = await fs.stat(attachmentPath);
      if (!stat.isFile()) {
        response.status(404).end();
        return;
      }

      response.type(record.mimeType);
      response.setHeader("Cache-Control", "private, max-age=3600");
      response.sendFile(attachmentPath, { dotfiles: "allow" }, (error) => {
        if (error && !response.headersSent) {
          next(error);
        }
      });
      logger?.debug("web.session_attachment.get.complete", { sessionid: request.params.sessionid, dataid: request.params.dataid, index });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
        response.status(404).end();
        return;
      }
      next(error);
    }
  });

  app.post("/api/agent/sessions/:sessionid/messages", async (request, response, next) => {
    try {
      const language = requestLanguage(request);
      logger?.warn("web.session_messages.append.rejected", { sessionid: request.params.sessionid, reason: "attached_socket_required" });
      if (!database) {
        response.status(503).json({ error: resources(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language }) });
        return;
      }

      response.status(409).json({ error: resources(NDX_AGENT_RESOURCE.WEB_SESSION_INPUT_SOCKET_REQUIRED_ERROR, { language }) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agent/sessions/:sessionid/interrupt", async (request, response, next) => {
    try {
      const language = requestLanguage(request);
      logger?.warn("web.session_interrupt.append.rejected", { sessionid: request.params.sessionid, reason: "attached_socket_required" });
      if (!database) {
        response.status(503).json({ error: resources(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language }) });
        return;
      }

      response.status(409).json({ error: resources(NDX_AGENT_RESOURCE.WEB_SESSION_INTERRUPT_SOCKET_REQUIRED_ERROR, { language }) });
    } catch (error) {
      next(error);
    }
  });
}

function requestLanguage(request: express.Request) {
  return normalizeNDXAgentLanguage(
    typeof request.query.language === "string"
      ? request.query.language
      : typeof request.body?.language === "string"
        ? request.body.language
        : request.header("accept-language")
  );
}

function toWebSession(session: NDXSessionRow): NDXAgentWebSession {
  return {
    ...session,
    lastupdated: session.lastupdated.toISOString()
  };
}

function toWebSessionData(data: NDXSessionDataRow): NDXAgentWebSessionData {
  return {
    ...data,
    dataid: String(data.dataid),
    createdat: data.createdat.toISOString()
  };
}
