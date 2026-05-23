import fs from "node:fs/promises";
import path from "node:path";
import type express from "express";
import { NDX_AGENT_WEB_API, type NDXAgentWebWorkspaceDirectoriesResponse } from "ndx/agent/web";
import type { NDXLogger } from "ndx/common";
import { serverContainerWorkspace, serverPathRelativeToWorkspace, toServerWorkspacePath } from "ndx/server/common";

export function attachAgentWebWorkspaceRoutes(app: express.Express, logger?: NDXLogger) {
  app.get(NDX_AGENT_WEB_API.workspaceDirectories, async (request, response, next) => {
    try {
      const requested = typeof request.query.path === "string" ? request.query.path : ".";
      const target = toServerWorkspacePath(requested);
      const entries = await fs.readdir(target, { withFileTypes: true });
      const directories = entries
        .filter((entry) => entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules" && entry.name !== ".yarn")
        .map((entry) => {
          const fullPath = path.posix.join(target, entry.name);
          return { name: entry.name, path: serverPathRelativeToWorkspace(fullPath) };
        })
        .sort((left, right) => left.name.localeCompare(right.name));
      const relative = serverPathRelativeToWorkspace(target);
      const parent = relative ? path.posix.dirname(relative) === "." ? "" : path.posix.dirname(relative) : undefined;
      const body: NDXAgentWebWorkspaceDirectoriesResponse = {
        root: serverContainerWorkspace(),
        path: relative,
        ...(parent === undefined ? {} : { parent }),
        directories
      };
      response.json(body);
      logger?.debug("web.workspace.directories.complete", { path: body.path, count: directories.length });
    } catch (error) {
      if (error instanceof Error && /outside configured workspace volume|outside configured server volumes/i.test(error.message)) {
        response.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });
}
