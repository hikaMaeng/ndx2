import type express from "express";
import { NDX_AGENT_RESOURCE, createNDXAgentResourceResolver, type NDXAgentResourceResolver } from "ndx/agent/common";
import { createUser, listUser, type NDXDatabase } from "ndx/agent/server";
import { NDX_AGENT_WEB_API, type NDXAgentWebCreateUserRequest, type NDXAgentWebUsersResponse } from "ndx/agent/web";
import type { NDXLogger } from "ndx/common";

export function attachAgentWebUserRoutes(app: express.Express, database?: NDXDatabase, logger?: NDXLogger, resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()) {
  app.get(NDX_AGENT_WEB_API.users, async (request, response, next) => {
    try {
      logger?.debug("web.users.list.start");
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.query.language }) });
        return;
      }

      const body: NDXAgentWebUsersResponse = {
        users: (await listUser(database)).map((user) => ({
          ...user,
          created: user.created.toISOString()
        }))
      };
      response.json(body);
      logger?.debug("web.users.list.complete", { count: body.users.length });
    } catch (error) {
      next(error);
    }
  });

  app.post(NDX_AGENT_WEB_API.users, async (request, response, next) => {
    try {
      logger?.info("web.users.create.start");
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.body?.language }) });
        return;
      }

      const body = request.body as Partial<NDXAgentWebCreateUserRequest>;
      const userid = typeof body.userid === "string" ? body.userid.trim() : "";
      const user = await createUser(database, userid);
      response.status(201).json({ ...user, created: user.created.toISOString() });
      logger?.info("web.users.create.complete", { userid: user.userid });
    } catch (error) {
      next(error);
    }
  });
}
