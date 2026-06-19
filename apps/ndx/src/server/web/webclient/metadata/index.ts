import type express from "express";
import { agentServerDomain } from "ndx/agent/init";
import { NDX_AGENT_WEB_API, type NDXAgentWebMetadataResponse } from "ndx/webclient/common";
import type { NDXLogger } from "ndx/common";
import { defaultServerVolumeMap, serverContainerWorkspace, serverHostWorkspace } from "ndx/common/server-path";

export function attachAgentWebMetadataRoutes(app: express.Express, options: { sessionSocketPath: string; version: string; logger?: NDXLogger }) {
  app.get(NDX_AGENT_WEB_API.metadata, (request, response) => {
    options.logger?.debug("web.metadata.get.start");
    const host = request.get("host") ?? request.hostname ?? "localhost";
    const sessionHttpUrl = `${request.protocol}://${host}`;
    const sessionSocketProtocol = request.protocol === "https" ? "wss" : "ws";
    const body: NDXAgentWebMetadataResponse = {
      service: "agent",
      version: options.version,
      surface: agentServerDomain.surface,
      session: {
        path: options.sessionSocketPath,
        healthUrl: `${sessionHttpUrl}/api/session/health`,
        socketUrl: `${sessionSocketProtocol}://${host}${options.sessionSocketPath}`
      },
      workspace: {
        hostRoot: defaultServerVolumeMap().hostRoot,
        hostWorkspaceRoot: serverHostWorkspace(),
        containerWorkspaceRoot: serverContainerWorkspace()
      }
    };

    response.json(body);
    options.logger?.debug("web.metadata.get.complete", { socketPath: options.sessionSocketPath });
  });
}
