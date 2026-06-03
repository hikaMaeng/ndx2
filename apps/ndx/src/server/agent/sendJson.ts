import { WebSocket } from "ws";
import type { SessionClientState } from "./types.js";

export async function sendJson(client: SessionClientState, message: unknown) {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(message));
  }
}
