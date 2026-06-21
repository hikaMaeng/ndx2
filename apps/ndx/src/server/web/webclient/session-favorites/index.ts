import type express from "express";
import {
  NDX_AGENT_RESOURCE,
  createNDXAgentResourceResolver,
  normalizeNDXAgentLanguage,
  type NDXAgentResourceResolver
} from "ndx/common";
import type { NDXDatabase } from "ndx/agent/init";
import {
  deleteWebSessionFavorite,
  listWebSessionFavorite,
  upsertWebSessionFavorite,
  type NDXWebSessionFavoriteRow
} from "ndx/webclient/server";
import type { NDXLogger } from "ndx/common";
import type { NDXAgentWebPinnedSession, NDXAgentWebSessionFavoritesResponse } from "ndx/webclient/common";

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function attachAgentWebSessionFavoriteRoutes(app: express.Express, database?: NDXDatabase, logger?: NDXLogger, resources: NDXAgentResourceResolver = createNDXAgentResourceResolver()) {
  app.get("/api/agent/session-favorites", async (request, response, next) => {
    try {
      const language = requestLanguage(request);
      logger?.debug("web.session_favorites.list.start");
      if (!database) {
        response.status(503).json({ error: resources(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language }) });
        return;
      }

      const body: NDXAgentWebSessionFavoritesResponse = {
        sessions: (await listWebSessionFavorite(database)).map(toWebPinnedSession)
      };
      response.json(body);
      logger?.debug("web.session_favorites.list.complete", { count: body.sessions.length });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/agent/sessions/:sessionid/favorite", async (request, response, next) => {
    try {
      const language = requestLanguage(request);
      logger?.info("web.session_favorite.upsert.start", { sessionid: request.params.sessionid });
      if (!database) {
        response.status(503).json({ error: resources(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language }) });
        return;
      }
      if (!SESSION_ID_PATTERN.test(request.params.sessionid)) {
        response.status(404).json({ error: resources(NDX_AGENT_RESOURCE.WEB_SESSION_NOT_FOUND_ERROR, { language }) });
        return;
      }

      const session = await upsertWebSessionFavorite(database, request.params.sessionid);
      if (!session) {
        response.status(404).json({ error: resources(NDX_AGENT_RESOURCE.WEB_SESSION_NOT_FOUND_ERROR, { language }) });
        return;
      }

      response.json(toWebPinnedSession(session));
      logger?.info("web.session_favorite.upsert.complete", { sessionid: request.params.sessionid });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/agent/sessions/:sessionid/favorite", async (request, response, next) => {
    try {
      const language = requestLanguage(request);
      logger?.info("web.session_favorite.delete.start", { sessionid: request.params.sessionid });
      if (!database) {
        response.status(503).json({ error: resources(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language }) });
        return;
      }
      if (!SESSION_ID_PATTERN.test(request.params.sessionid)) {
        response.status(204).end();
        return;
      }

      await deleteWebSessionFavorite(database, request.params.sessionid);
      response.status(204).end();
      logger?.info("web.session_favorite.delete.complete", { sessionid: request.params.sessionid });
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

function toWebPinnedSession(session: NDXWebSessionFavoriteRow): NDXAgentWebPinnedSession {
  return {
    ...session,
    lastupdated: session.lastupdated.toISOString(),
    pinnedat: session.pinnedat.toISOString()
  };
}
