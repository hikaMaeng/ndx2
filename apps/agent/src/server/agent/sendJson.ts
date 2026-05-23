import { NDX_PROJECT_NEGOTIATED, NDX_SESSION_READY } from "ndx/agent/common/protocol";
import { WebSocket } from "ws";
import type { SessionClientState } from "./types.js";

export async function sendJson(client: SessionClientState, message: unknown) {
  let outbound = message;
  const type = outbound && typeof outbound === "object" && "type" in outbound ? outbound.type : undefined;
  if (client.projectPath && outbound && typeof outbound === "object" && (type === NDX_PROJECT_NEGOTIATED || type === NDX_SESSION_READY)) {
    outbound = {
      ...outbound,
      ...("projectId" in outbound ? { projectId: client.projectId } : {}),
      ...("projectPath" in outbound ? { projectPath: client.projectPath } : {})
    };
  }

  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(outbound));
  }
}
