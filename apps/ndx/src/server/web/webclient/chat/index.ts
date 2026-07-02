import type express from "express";
import {
  createChatFolder,
  createChatSession,
  deleteChatFolder,
  deleteChatSession,
  ensureRootChatFolder,
  getChatSession,
  listChatFolder,
  listChatSession,
  listChatSessionData,
  runChatSessionTurn,
  updateChatFolderTitle,
  updateChatSessionTitle,
  type NDXChatFolderRow,
  type NDXChatSessionRow
} from "ndx/agent/chat";
import type { NDXDatabase } from "ndx/agent/init";
import type { NDXModelConfig } from "ndx/agent/session";
import { NDX_AGENT_RESOURCE, type NDXAgentResourceResolver } from "ndx/common";
import { NDX_TURN_EVENT } from "ndx/common/protocol";
import { NDX_CONTAINER_USER_HOME } from "ndx/common/server-path";
import { findSettingsModel, readNDXSettingsDocument, resolveSettingsModelConfig } from "ndx/common/settings";
import type { NDXLogger } from "ndx/common";
import type {
  NDXAgentWebChatFolder,
  NDXAgentWebChatFoldersResponse,
  NDXAgentWebChatSession,
  NDXAgentWebChatSessionsResponse,
  NDXAgentWebCreateChatFolderRequest,
  NDXAgentWebCreateChatSessionRequest,
  NDXAgentWebUpdateChatFolderRequest,
  NDXAgentWebUpdateChatSessionRequest
} from "ndx/webclient/common";

export function attachAgentWebChatRoutes(app: express.Express, database?: NDXDatabase, logger?: NDXLogger, resource?: NDXAgentResourceResolver) {
  app.get("/api/agent/chat/folders", async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: resource?.(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.query.language }) ?? "database unavailable" });
        return;
      }
      await ensureRootChatFolder(database);
      const body: NDXAgentWebChatFoldersResponse = { folders: (await listChatFolder(database)).map(toWebChatFolder) };
      response.json(body);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agent/chat/folders", async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database unavailable" });
        return;
      }
      const body = request.body as Partial<NDXAgentWebCreateChatFolderRequest>;
      const title = typeof body.title === "string" ? body.title : "";
      response.status(201).json(toWebChatFolder(await createChatFolder(database, title)));
      logger?.info("web.chat.folder.create.complete");
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/agent/chat/folders/:folderid", async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database unavailable" });
        return;
      }
      const body = request.body as Partial<NDXAgentWebUpdateChatFolderRequest>;
      response.json(toWebChatFolder(await updateChatFolderTitle(database, request.params.folderid, typeof body.title === "string" ? body.title : "")));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/agent/chat/folders/:folderid", async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database unavailable" });
        return;
      }
      const deleted = await deleteChatFolder(database, request.params.folderid);
      if (!deleted) {
        response.status(404).json({ error: "chat folder not found or root folder cannot be deleted." });
        return;
      }
      response.json(toWebChatFolder(deleted));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agent/chat/folders/:folderid/sessions", async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database unavailable" });
        return;
      }
      const body: NDXAgentWebChatSessionsResponse = {
        sessions: (await listChatSession(database, request.params.folderid)).map(toWebChatSession)
      };
      response.json(body);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agent/chat/folders/:folderid/sessions", async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database unavailable" });
        return;
      }
      const body = request.body as Partial<NDXAgentWebCreateChatSessionRequest>;
      if (!body.model || typeof body.model !== "object") {
        response.status(400).json({ error: "model is required." });
        return;
      }
      const submittedModel = body.model as NDXModelConfig;
      const model = (await resolveCurrentChatModel(submittedModel).catch((error) => {
        logger?.warn("web.chat.model.resolve_current.failed", { error: error instanceof Error ? error.message : String(error) });
        return submittedModel;
      })) ?? submittedModel;
      response.status(201).json(toWebChatSession(await createChatSession(database, {
        folderid: request.params.folderid,
        model,
        title: typeof body.title === "string" ? body.title : ""
      })));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/agent/chat/sessions/:chatsessionid", async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database unavailable" });
        return;
      }
      const body = request.body as Partial<NDXAgentWebUpdateChatSessionRequest>;
      response.json(toWebChatSession(await updateChatSessionTitle(database, request.params.chatsessionid, typeof body.title === "string" ? body.title : "")));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agent/chat/sessions/:chatsessionid/data", async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database unavailable" });
        return;
      }
      const session = await getChatSession(database, request.params.chatsessionid);
      if (!session) {
        response.status(404).json({ error: "chat session not found." });
        return;
      }
      response.json({
        chatSession: toWebChatSession(session),
        data: (await listChatSessionData(database, request.params.chatsessionid)).map((row) => ({
          dataid: row.dataid,
          sessionid: row.chatsessionid,
          type: row.type,
          contents: row.contents,
          createdat: row.createdat.toISOString()
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agent/chat/sessions/:chatsessionid/messages", async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database unavailable" });
        return;
      }
      const session = await getChatSession(database, request.params.chatsessionid);
      if (!session) {
        response.status(404).json({ error: "chat session not found." });
        return;
      }
      if (session.isrunning) {
        response.status(409).json({ error: "chat session is already running." });
        return;
      }
      const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
      if (!text) {
        response.status(400).json({ error: "text is required." });
        return;
      }
      const submittedModel = request.body?.model && typeof request.body.model === "object" ? request.body.model as NDXModelConfig : undefined;
      const model = await resolveCurrentChatModel(submittedModel).catch((error) => {
        logger?.warn("web.chat.model.resolve_current.failed", { error: error instanceof Error ? error.message : String(error) });
        return submittedModel;
      });
      if (request.accepts(["text/event-stream", "json"]) === "text/event-stream") {
        response.status(200);
        response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("Connection", "keep-alive");
        response.flushHeaders?.();
        const writeStreamEvent = (body: unknown) => response.write(`data: ${JSON.stringify(body)}\n\n`);
        try {
          await runChatSessionTurn(database, session, { text }, model, {
            onEvent: async (event) => {
              const data = event as { type?: string; content?: unknown; delta?: unknown; summary?: unknown; contents?: unknown };
              if (data.type === NDX_TURN_EVENT.AssistantDelta) {
                writeStreamEvent({ kind: "assistant_delta", text: typeof data.content === "string" ? data.content : typeof data.delta === "string" ? data.delta : "" });
              } else if (data.type === NDX_TURN_EVENT.AssistantReasoning) {
                writeStreamEvent({ kind: "assistant_reasoning", text: typeof data.summary === "string" ? data.summary : "" });
              } else if (data.type === NDX_TURN_EVENT.CotWork) {
                writeStreamEvent({ kind: "assistant_reasoning", contents: data.contents });
              }
            }
          });
          writeStreamEvent({
            kind: "complete",
            session: toWebChatSession((await getChatSession(database, request.params.chatsessionid)) ?? session),
            data: (await listChatSessionData(database, request.params.chatsessionid)).map((row) => ({
              dataid: row.dataid,
              sessionid: row.chatsessionid,
              type: row.type,
              contents: row.contents,
              createdat: row.createdat.toISOString()
            }))
          });
          response.end();
        } catch (error) {
          writeStreamEvent({ kind: "error", error: error instanceof Error ? error.message : String(error) });
          response.end();
        }
        return;
      }
      await runChatSessionTurn(database, session, { text }, model);
      response.json({
        session: toWebChatSession((await getChatSession(database, request.params.chatsessionid)) ?? session),
        data: (await listChatSessionData(database, request.params.chatsessionid)).map((row) => ({
          dataid: row.dataid,
          sessionid: row.chatsessionid,
          type: row.type,
          contents: row.contents,
          createdat: row.createdat.toISOString()
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/agent/chat/sessions/:chatsessionid", async (request, response, next) => {
    try {
      if (!database) {
        response.status(503).json({ error: "database unavailable" });
        return;
      }
      const deleted = await deleteChatSession(database, request.params.chatsessionid);
      if (!deleted) {
        response.status(404).json({ error: "chat session not found." });
        return;
      }
      response.json(toWebChatSession(deleted));
    } catch (error) {
      next(error);
    }
  });
}

async function resolveCurrentChatModel(model: NDXModelConfig | undefined): Promise<NDXModelConfig | undefined> {
  if (!model?.model.trim()) return model;
  const settings = await readNDXSettingsDocument(NDX_CONTAINER_USER_HOME);
  const providerModel = model.provider ? findSettingsModel(settings, model.provider, model.model) : undefined;
  const resolved = resolveSettingsModelConfig(settings, providerModel?.key ?? model.model, model.contextsize);
  if (!resolved) return model;
  return {
    ...resolved.model,
    reasoningEffort: model.reasoningEffort ?? resolved.model.reasoningEffort,
    ...(typeof model.temperature === "number" ? { temperature: model.temperature } : {}),
    ...(typeof model.topP === "number" ? { topP: model.topP } : {}),
    ...(typeof model.topK === "number" ? { topK: model.topK } : {}),
    ...(typeof model.minP === "number" ? { minP: model.minP } : {})
  };
}

function toWebChatFolder(row: NDXChatFolderRow): NDXAgentWebChatFolder {
  return {
    ...row,
    createdat: row.createdat.toISOString(),
    updatedat: row.updatedat.toISOString()
  };
}

function toWebChatSession(row: NDXChatSessionRow): NDXAgentWebChatSession {
  return {
    chatsessionid: row.chatsessionid,
    folderid: row.folderid,
    title: row.title,
    model: row.model,
    isrunning: row.isrunning,
    createdat: row.createdat.toISOString(),
    lastupdated: row.lastupdated.toISOString()
  };
}
