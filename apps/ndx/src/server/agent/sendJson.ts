import { WebSocket } from "ws";
import type { NDXSocketServerMessage } from "ndx/common/protocol";
import type { SessionClientState } from "./types.js";

export async function sendJson(client: SessionClientState, message: NDXSocketServerMessage) {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(message));
  }
}
