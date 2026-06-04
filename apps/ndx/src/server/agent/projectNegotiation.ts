import fs from "node:fs/promises";
import {
  NDX_PROJECT_NEGOTIATED,
  NDX_PROJECT_NEGOTIATION_REQUIRED,
  NDX_PROTOCOL_ERROR,
  NDX_AGENT_RESOURCE,
  NDX_SESSION_READY,
  createNDXAgentResourceResolver,
  isNDXProjectConfigureMessage
} from "ndx/common";
import type { NDXAgentResourceResolver } from "ndx/common";
import type { NDXDatabase } from "ndx/agent";
import type { NDXLogger } from "ndx/common";
import { normalizeWorkspaceProjectName, serverWorkspaceProjectPath } from "ndx/common/server-path";
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

  let projectName: string;
  try {
    projectName = normalizeWorkspaceProjectName(message.projectName);
    const stat = await fs.stat(serverWorkspaceProjectPath(projectName));
    if (!stat.isDirectory()) {
      throw new Error(`Project not found: ${projectName}`);
    }
  } catch (error) {
    logger?.warn("agent.socket.project_negotiation.rejected", { clientid: client.clientid, reason: "workspace_project", error });
    await sendJson(client, {
      type: NDX_PROTOCOL_ERROR,
      error: error instanceof Error ? error.message : resource(NDX_AGENT_RESOURCE.PROTOCOL_PROJECT_PATH_OUTSIDE_WORKSPACE_ERROR, { language: client.language })
    });
    return false;
  }

  client.projectName = projectName;
  if (!client.userid) {
    await sendJson(client, {
      type: NDX_PROTOCOL_ERROR,
      error: resource(NDX_AGENT_RESOURCE.PROTOCOL_ACCOUNT_SELECTION_REQUIRED_ERROR, { language: client.language })
    });
    return false;
  }
  await sendJson(client, {
    type: NDX_PROJECT_NEGOTIATED,
    projectName: client.projectName
  });
  await sendJson(client, {
    type: NDX_SESSION_READY,
    clientid: client.clientid,
    userid: client.userid,
    projectName: client.projectName
  });
  logger?.info("agent.socket.project_negotiation.accepted", {
    clientid: client.clientid,
    userid: client.userid,
    projectName: client.projectName
  });
  return true;
}
