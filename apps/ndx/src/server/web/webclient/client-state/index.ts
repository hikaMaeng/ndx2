import type express from "express";
import { NDX_AGENT_RESOURCE, createNDXAgentResourceResolver, isNDXClientId, type NDXAgentResourceResolver } from "ndx/common";
import type { NDXDatabase } from "ndx/agent/init";
import {
  createInitialWebClientState,
  getWebClientState,
  normalizeWebClientState,
  upsertWebClientState
} from "ndx/webclient/server/client-state";
import {
  NDX_AGENT_WEB_API,
  type NDXAgentWebClientStateResponse,
  type NDXAgentWebUpdateClientStateRequest
} from "ndx/webclient/common";
import type { NDXLogger } from "ndx/common";

export function attachAgentWebClientStateRoutes(app: express.Express, database?: NDXDatabase, logger?: NDXLogger, resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()) {
  app.get(NDX_AGENT_WEB_API.webClientState, async (request, response, next) => {
    try {
      logger?.debug("web.client_state.get.start", { clientid: request.query.clientid });
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.query.language }) });
        return;
      }

      const clientid = request.query.clientid;
      if (!isNDXClientId(clientid)) {
        response.status(400).json({ error: resource(NDX_AGENT_RESOURCE.WEB_CLIENT_ID_INVALID_ERROR, { language: request.query.language }) });
        return;
      }

      const row = await getWebClientState(database, clientid);
      const body: NDXAgentWebClientStateResponse = row
        ? {
            ...row,
            updatedat: row.updatedat.toISOString()
          }
        : {
            clientid,
            userid: null,
            state: createInitialWebClientState(),
            updatedat: null
          };
      response.json(body);
      logger?.debug("web.client_state.get.complete", { clientid });
    } catch (error) {
      next(error);
    }
  });

  app.put(NDX_AGENT_WEB_API.webClientState, async (request, response, next) => {
    try {
      logger?.info("web.client_state.upsert.start");
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.body?.language }) });
        return;
      }

      const body = request.body as Partial<NDXAgentWebUpdateClientStateRequest>;
      if (!isNDXClientId(body.clientid)) {
        response.status(400).json({ error: resource(NDX_AGENT_RESOURCE.WEB_CLIENT_ID_INVALID_ERROR, { language: request.body?.language }) });
        return;
      }

      const state = normalizeWebClientState(body.state);
      const row = await upsertWebClientState(database, {
        clientid: body.clientid,
        userid: typeof body.userid === "string" ? body.userid : state.selectedUserid,
        state
      });
      const responseBody: NDXAgentWebClientStateResponse = {
        ...row,
        updatedat: row.updatedat.toISOString()
      };
      response.json(responseBody);
      logger?.info("web.client_state.upsert.complete", { clientid: responseBody.clientid, userid: responseBody.userid });
    } catch (error) {
      next(error);
    }
  });
}
