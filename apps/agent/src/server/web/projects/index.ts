import type express from "express";
import { NDX_AGENT_RESOURCE, createNDXAgentResourceResolver, type NDXAgentResourceResolver } from "ndx/agent/common";
import { ensureProject, type NDXDatabase } from "ndx/agent/server";
import {
  DEFAULT_NDX_WEB_CLIENT_USERID,
  deleteWebProject,
  listWebProject,
  updateWebProjectActive,
  updateWebProjectUser,
  upsertWebProject
} from "ndx/agent/web/client-state";
import {
  NDX_AGENT_WEB_API,
  type NDXAgentWebCreateProjectRequest,
  type NDXAgentWebProject,
  type NDXAgentWebProjectsResponse,
  type NDXAgentWebUpdateProjectActiveRequest,
  type NDXAgentWebUpdateProjectUserRequest
} from "ndx/agent/web";
import type { NDXLogger } from "ndx/common";
import { toServerWorkspaceDescendantPath } from "ndx/server/common";

export function attachAgentWebProjectRoutes(app: express.Express, database?: NDXDatabase, logger?: NDXLogger, resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()) {
  app.get(NDX_AGENT_WEB_API.webProjects, async (request, response, next) => {
    try {
      logger?.debug("web.projects.list.start");
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.query.language }) });
        return;
      }

      const body: NDXAgentWebProjectsResponse = {
        projects: (await listWebProject(database)).map((project) => ({
          ...project,
          updatedat: project.updatedat.toISOString()
        }))
      };
      response.json(body);
      logger?.debug("web.projects.list.complete", { count: body.projects.length });
    } catch (error) {
      next(error);
    }
  });

  app.post(NDX_AGENT_WEB_API.webProjects, async (request, response, next) => {
    try {
      logger?.info("web.projects.upsert.start");
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.body?.language }) });
        return;
      }

      const body = request.body as Partial<NDXAgentWebCreateProjectRequest>;
      if (typeof body.path !== "string") {
        response.status(400).json({ error: resource(NDX_AGENT_RESOURCE.WEB_PATH_REQUIRED_ERROR, { language: request.body?.language }) });
        return;
      }

      let projectPath: string;
      try {
        projectPath = toServerWorkspaceDescendantPath(body.path);
      } catch (error) {
        response.status(400).json({ error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_PATH_OUTSIDE_WORKSPACE_ERROR, { language: request.body?.language }) });
        return;
      }

      const identity = await ensureProject(database, {
        path: projectPath,
        target: typeof body.target === "string" ? body.target : "local"
      });
      const project = await upsertWebProject(database, {
        projectid: identity.projectid,
        userid: typeof body.userid === "string" ? body.userid : DEFAULT_NDX_WEB_CLIENT_USERID
      });
      const responseBody: NDXAgentWebProject = { ...project, updatedat: project.updatedat.toISOString() };
      response.status(201).json(responseBody);
      logger?.info("web.projects.upsert.complete", { projectid: responseBody.projectid, path: responseBody.path });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/agent/web-projects/:projectid/user", async (request, response, next) => {
    try {
      logger?.info("web.projects.user.update.start", { projectid: request.params.projectid });
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.body?.language }) });
        return;
      }

      const body = request.body as Partial<NDXAgentWebUpdateProjectUserRequest>;
      const userid = typeof body.userid === "string" ? body.userid.trim() : "";
      const project = await updateWebProjectUser(database, request.params.projectid, userid);
      const responseBody: NDXAgentWebProject = { ...project, updatedat: project.updatedat.toISOString() };
      response.json(responseBody);
      logger?.info("web.projects.user.update.complete", { projectid: responseBody.projectid, userid: responseBody.userid });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/agent/web-projects/:projectid/active", async (request, response, next) => {
    try {
      logger?.info("web.projects.active.update.start", { projectid: request.params.projectid });
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.body?.language }) });
        return;
      }

      const body = request.body as Partial<NDXAgentWebUpdateProjectActiveRequest>;
      if (typeof body.isactive !== "boolean") {
        response.status(400).json({ error: resource(NDX_AGENT_RESOURCE.WEB_ISACTIVE_REQUIRED_ERROR, { language: request.body?.language }) });
        return;
      }

      const project = body.isactive
        ? await updateWebProjectActive(database, request.params.projectid, true)
        : await deleteWebProject(database, request.params.projectid);
      const responseBody: NDXAgentWebProject = { ...project, updatedat: project.updatedat.toISOString() };
      response.json(responseBody);
      logger?.info("web.projects.active.update.complete", { projectid: responseBody.projectid, isactive: responseBody.isactive });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/agent/web-projects/:projectid", async (request, response, next) => {
    try {
      logger?.info("web.projects.delete.start", { projectid: request.params.projectid });
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.query.language }) });
        return;
      }

      const project = await deleteWebProject(database, request.params.projectid);
      const responseBody: NDXAgentWebProject = { ...project, updatedat: project.updatedat.toISOString() };
      response.json(responseBody);
      logger?.info("web.projects.delete.complete", { projectid: responseBody.projectid });
    } catch (error) {
      next(error);
    }
  });
}
