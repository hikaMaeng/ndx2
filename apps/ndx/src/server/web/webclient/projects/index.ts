import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import type express from "express";
import { NDX_AGENT_RESOURCE, createNDXAgentResourceResolver, type NDXAgentResourceResolver } from "ndx/common";
import type { NDXDatabase } from "ndx/agent/init";
import {
  DEFAULT_NDX_WEB_CLIENT_USERID,
  deleteWebProject,
  listWebProject,
  updateWebProjectUser,
  upsertWebProject
} from "ndx/webclient/server/client-state";
import {
  NDX_AGENT_WEB_API,
  type NDXAgentWebCreateProjectRequest,
  type NDXAgentWebProject,
  type NDXAgentWebProjectsResponse,
  type NDXAgentWebUpdateProjectUserRequest
} from "ndx/webclient/common";
import type { NDXLogger } from "ndx/common";
import { normalizeWorkspaceProjectName, serverContainerWorkspace, serverWorkspaceProjectPath, toHostWorkspacePath } from "ndx/common/server-path";

const pendingProjectDeletes = new Set<string>();

export function attachAgentWebProjectRoutes(app: express.Express, database?: NDXDatabase, logger?: NDXLogger, resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()) {
  app.get(NDX_AGENT_WEB_API.webProjects, async (request, response, next) => {
    try {
      logger?.debug("web.projects.list.start");
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.query.language }) });
        return;
      }

      const preferences = new Map((await listWebProject(database)).map((project) => [project.projectname, project]));
      const projects = (await listWorkspaceProjectNames()).filter((projectName) => !pendingProjectDeletes.has(projectName));
      for (const projectName of projects) {
        if (!preferences.has(projectName)) {
          preferences.set(projectName, await upsertWebProject(database, {
            projectname: projectName,
            userid: DEFAULT_NDX_WEB_CLIENT_USERID
          }));
        }
      }

      const body: NDXAgentWebProjectsResponse = {
        projects: projects
          .map((projectName) => webProjectResponse(preferences.get(projectName) ?? {
            projectname: projectName,
            screenorder: 0,
            userid: DEFAULT_NDX_WEB_CLIENT_USERID,
            updatedat: new Date(0)
          }))
          .sort((left, right) => right.screenorder - left.screenorder || left.projectName.localeCompare(right.projectName))
      };
      response.json(body);
      logger?.debug("web.projects.list.complete", { count: body.projects.length });
    } catch (error) {
      next(error);
    }
  });

  app.post(NDX_AGENT_WEB_API.webProjects, async (request, response, next) => {
    try {
      logger?.info("web.projects.create.start");
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.body?.language }) });
        return;
      }

      const body = request.body as Partial<NDXAgentWebCreateProjectRequest>;
      if (typeof body.name !== "string") {
        response.status(400).json({ error: resource(NDX_AGENT_RESOURCE.WEB_PATH_REQUIRED_ERROR, { language: request.body?.language }) });
        return;
      }

      let projectName: string;
      try {
        projectName = normalizeWorkspaceProjectName(body.name);
      } catch (error) {
        response.status(400).json({ error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.WEB_PATH_REQUIRED_ERROR, { language: request.body?.language }) });
        return;
      }

      try {
        await fs.mkdir(serverWorkspaceProjectPath(projectName));
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "EEXIST") {
          response.status(409).json({ error: `Project already exists: ${projectName}` });
          return;
        }
        throw error;
      }

      const project = await upsertWebProject(database, {
        projectname: projectName,
        screenorder: body.screenorder,
        userid: typeof body.userid === "string" ? body.userid : DEFAULT_NDX_WEB_CLIENT_USERID
      });
      const responseBody = webProjectResponse(project);
      response.status(201).json(responseBody);
      logger?.info("web.projects.create.complete", { projectName: responseBody.projectName, path: responseBody.path });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/agent/web-projects/:projectName/user", async (request, response, next) => {
    try {
      const projectName = normalizeWorkspaceProjectName(request.params.projectName);
      logger?.info("web.projects.user.update.start", { projectName });
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.body?.language }) });
        return;
      }

      const body = request.body as Partial<NDXAgentWebUpdateProjectUserRequest>;
      const userid = typeof body.userid === "string" ? body.userid.trim() : "";
      const project = await updateWebProjectUser(database, projectName, userid);
      const responseBody = webProjectResponse(project);
      response.json(responseBody);
      logger?.info("web.projects.user.update.complete", { projectName: responseBody.projectName, userid: responseBody.userid });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/agent/web-projects/:projectName", async (request, response, next) => {
    try {
      const projectName = normalizeWorkspaceProjectName(request.params.projectName);
      logger?.info("web.projects.delete.start", { projectName });
      if (!database) {
        response.status(503).json({ error: resource(NDX_AGENT_RESOURCE.WEB_DATABASE_UNAVAILABLE_ERROR, { language: request.query.language }) });
        return;
      }

      const project = await deleteWebProject(database, projectName);
      pendingProjectDeletes.add(projectName);
      response.status(202).json(webProjectResponse(project));
      void deleteProjectDirectoryAndSessions(database, projectName, logger).catch((error: unknown) => {
        logger?.error("web.projects.delete.background_failed", { projectName, error });
      }).finally(() => {
        pendingProjectDeletes.delete(projectName);
      });
      logger?.info("web.projects.delete.accepted", { projectName });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agent/web-projects/:projectName/open-vscode", async (request, response, next) => {
    try {
      const projectName = normalizeWorkspaceProjectName(request.params.projectName);
      logger?.info("web.projects.vscode.open.start", { projectName });

      let hostPath: string;
      try {
        hostPath = toHostWorkspacePath(serverWorkspaceProjectPath(projectName));
      } catch (error) {
        response.status(400).json({ error: error instanceof Error ? error.message : "Project path is outside the configured workspace." });
        return;
      }

      const code = spawn("code", ["--new-window", hostPath], {
        detached: true,
        stdio: "ignore"
      });
      let settled = false;
      code.once("error", (error) => {
        if (settled) return;
        settled = true;
        logger?.warn("web.projects.vscode.open.failed", { projectName, path: hostPath, error });
        response.status(503).json({ error: `VS Code CLI is unavailable: ${error.message}` });
      });
      code.once("spawn", () => {
        settled = true;
        code.unref();
        response.status(204).end();
        logger?.info("web.projects.vscode.open.complete", { projectName, path: hostPath });
      });
    } catch (error) {
      next(error);
    }
  });
}

async function listWorkspaceProjectNames(): Promise<string[]> {
  const entries = await fs.readdir(serverContainerWorkspace(), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules" && entry.name !== ".yarn")
    .map((entry) => normalizeWorkspaceProjectName(entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function webProjectResponse(project: { projectname: string; screenorder: number; userid: string; updatedat: Date }): NDXAgentWebProject {
  return {
    projectName: project.projectname,
    name: project.projectname,
    path: serverWorkspaceProjectPath(project.projectname),
    screenorder: project.screenorder,
    userid: project.userid,
    updatedat: project.updatedat.toISOString()
  };
}

async function deleteProjectDirectoryAndSessions(database: NDXDatabase, projectName: string, logger?: NDXLogger): Promise<void> {
  await database.query(
    `
WITH deleted_data AS (
  DELETE FROM sessiondata
  WHERE sessionid IN (SELECT sessionid FROM "session" WHERE projectname = $1)
  RETURNING 1
)
DELETE FROM "session"
WHERE projectname = $1;
`,
    [projectName]
  );
  await fs.rm(serverWorkspaceProjectPath(projectName), { recursive: true, force: true });
  logger?.info("web.projects.delete.background_complete", { projectName });
}
