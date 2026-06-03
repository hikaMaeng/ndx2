import {
  NDX_ACCOUNT_SELECTED,
  NDX_ACCOUNT_SELECTION_REQUIRED,
  NDX_AGENT_RESOURCE,
  NDX_PROJECT_NEGOTIATION_REQUIRED,
  createNDXAgentResourceResolver,
  isNDXAccountSelectMessage
} from "ndx/common";
import type { NDXAgentResourceResolver } from "ndx/common";
import { listUser, type NDXDatabase } from "ndx/agent";
import type { NDXLogger } from "ndx/common";
import type { SessionClientState } from "./types.js";
import { sendJson } from "./sendJson.js";

export async function requireAccountSelection(client: SessionClientState, database: NDXDatabase, error?: string, logger?: NDXLogger) {
  logger?.info("agent.socket.account_selection.required", { clientid: client.clientid, hasError: Boolean(error), error });
  const users = await listUser(database);
  await sendJson(client, {
    type: NDX_ACCOUNT_SELECTION_REQUIRED,
    users: users.map((user) => ({
      userid: user.userid,
      created: user.created.toISOString()
    })),
    ...(error ? { error } : {})
  });
}

export async function acceptAccountSelection(
  client: SessionClientState,
  message: unknown,
  database: NDXDatabase,
  logger?: NDXLogger,
  resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()
) {
  if (!isNDXAccountSelectMessage(message)) {
    logger?.warn("agent.socket.account_selection.rejected", { clientid: client.clientid, reason: "message_type" });
    await requireAccountSelection(client, database, resource(NDX_AGENT_RESOURCE.PROTOCOL_ACCOUNT_SELECTION_REQUIRED_ERROR, { language: client.language }), logger);
    return false;
  }

  const users = await listUser(database);
  if (!users.some((user) => user.userid === message.userid)) {
    logger?.warn("agent.socket.account_selection.rejected", { clientid: client.clientid, userid: message.userid, reason: "unknown_userid" });
    await requireAccountSelection(client, database, resource(NDX_AGENT_RESOURCE.PROTOCOL_ACCOUNT_SELECTION_UNKNOWN_USER_ERROR, { language: client.language }), logger);
    return false;
  }

  client.userid = message.userid;
  await sendJson(client, { type: NDX_ACCOUNT_SELECTED, userid: client.userid });
  await sendJson(client, { type: NDX_PROJECT_NEGOTIATION_REQUIRED });
  logger?.info("agent.socket.account_selection.accepted", { clientid: client.clientid, userid: client.userid });
  return true;
}
