import fs from "node:fs/promises";
import type express from "express";
import { NDX_AGENT_WEB_API, type NDXAgentWebWorkspaceDirectoriesResponse } from "ndx/webclient/common";
import type { NDXLogger } from "ndx/common";
import { normalizeWorkspaceProjectName, serverContainerWorkspace } from "ndx/common/server-path";

export function attachAgentWebWorkspaceRoutes(app: express.Express, logger?: NDXLogger) {
  app.get(NDX_AGENT_WEB_API.workspaceDirectories, async (request, response, next) => {
    try {
      const workspace = serverContainerWorkspace();
      const entries = await fs.readdir(workspace, { withFileTypes: true });
      const directories = entries
        .filter((entry) => entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules" && entry.name !== ".yarn")
        .map((entry) => normalizeWorkspaceProjectName(entry.name))
        .map((name) => ({ name, path: name }))
        .sort((left, right) => left.name.localeCompare(right.name));
      const body: NDXAgentWebWorkspaceDirectoriesResponse = {
        root: workspace,
        path: "",
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
