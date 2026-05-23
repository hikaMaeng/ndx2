import type { WebSocketServer } from "ws";
import type { NDXLogger } from "ndx/common";
import type { SessionClientState } from "./types.js";

export function startSessionHeartbeat(
  socketServer: WebSocketServer,
  connectedClients: Map<string, SessionClientState>,
  heartbeatIntervalMs: number,
  heartbeatFailureLimit: number,
  logger?: NDXLogger
) {
  const heartbeat = setInterval(() => {
    for (const client of connectedClients.values()) {
      if (client.pongSinceLastPing) {
        client.pongSinceLastPing = false;
        client.socket.ping();
        logger?.debug("agent.socket.heartbeat.ping", { clientid: client.clientid, missedPings: client.missedPings });
        continue;
      }

      client.missedPings += 1;
      if (client.missedPings >= heartbeatFailureLimit) {
        logger?.warn("agent.socket.heartbeat.terminate", {
          clientid: client.clientid,
          missedPings: client.missedPings,
          heartbeatFailureLimit
        });
        client.socket.terminate();
      } else {
        client.socket.ping();
        logger?.debug("agent.socket.heartbeat.ping_retry", { clientid: client.clientid, missedPings: client.missedPings });
      }
    }
  }, heartbeatIntervalMs);
  heartbeat.unref();

  socketServer.on("close", () => {
    logger?.info("agent.socket.heartbeat.stop");
    clearInterval(heartbeat);
  });
}
