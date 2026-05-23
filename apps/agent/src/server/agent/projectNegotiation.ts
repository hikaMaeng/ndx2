import {
  NDX_PROJECT_NEGOTIATED,
  NDX_PROJECT_NEGOTIATION_REQUIRED,
  NDX_PROTOCOL_ERROR,
  NDX_AGENT_RESOURCE,
  NDX_SESSION_READY,
  createNDXAgentResourceResolver,
  isNDXProjectConfigureMessage
} from "ndx/agent/common";
import type { NDXAgentResourceResolver } from "ndx/agent/common";
import { ensureProject, type NDXDatabase } from "ndx/agent/server";
import type { NDXLogger } from "ndx/common";
import { toServerWorkspaceDescendantPath } from "ndx/server/common";
import type { SessionClientState } from "./types.js";
import { sendJson } from "./sendJson.js";

export async function acceptProjectNegotiation(
  client: SessionClientState,
  message: unknown,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  if (!isNDXProjectConfigureMessage(message)) {
    logger?.warn("agent.socket.project_negotiation.rejected", { clientid: client.clientid, reason: "message_type" });
    await sendJson(client, {
      type: NDX_PROJECT_NEGOTIATION_REQUIRED,
      error: resource(NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_CONFIG_REQUIRED_ERROR, { language: client.language })
    });
    return false;
  }

  let projectPath: string;
  try {
    projectPath = toServerWorkspaceDescendantPath(message.projectPath);
  } catch (error) {
    logger?.warn("agent.socket.project_negotiation.rejected", { clientid: client.clientid, reason: "workspace_path", error });
    await sendJson(client, {
      type: NDX_PROTOCOL_ERROR,
      error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_PATH_OUTSIDE_WORKSPACE_ERROR, { language: client.language })
    });
    return false;
  }

  const identity = await ensureProject(database, { path: projectPath, target: "local" });
  client.projectId = identity.projectid;
  client.projectPath = identity.path;
  await sendJson(client, {
    type: NDX_PROJECT_NEGOTIATED,
    projectId: client.projectId,
    projectPath: client.projectPath
  });
  await sendJson(client, {
    type: NDX_SESSION_READY,
    clientid: client.clientid,
    userid: client.userid,
    projectId: client.projectId,
    projectPath: client.projectPath
  });
  logger?.info("agent.socket.project_negotiation.accepted", {
    clientid: client.clientid,
    userid: client.userid,
    projectId: client.projectId,
    projectPath: client.projectPath
  });
  return true;
}
