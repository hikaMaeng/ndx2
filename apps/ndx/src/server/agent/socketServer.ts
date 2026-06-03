import type http from "node:http";
import { NDX_CLIENT_ID_QUERY_PARAM, isNDXClientId } from "ndx/common";
import { WebSocketServer } from "ws";
import { handleSessionConnection } from "./connection.js";
import { startSessionHeartbeat } from "./heartbeat.js";
import type { AttachSessionSocketServerOptions, SessionClientState } from "./types.js";

/** Attaches the agent session WebSocket surface to the existing HTTP server. */
export function attachSessionSocketServer(server: http.Server, options: AttachSessionSocketServerOptions) {
  const socketPath = options.path ?? "/session";
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 20_000;
  const heartbeatFailureLimit = options.heartbeatFailureLimit ?? 10;
  const connectedClients = new Map<string, SessionClientState>();
  const socketServer = new WebSocketServer({ noServer: true });
  options.logger?.info("agent.socket.attach", { path: socketPath, heartbeatIntervalMs, heartbeatFailureLimit });

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (requestUrl.pathname !== socketPath) {
      options.logger?.warn("agent.socket.upgrade.rejected", { path: requestUrl.pathname, reason: "unknown_path" });
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\nunknown websocket path.");
      socket.destroy();
      return;
    }

    const clientid = requestUrl.searchParams.get(NDX_CLIENT_ID_QUERY_PARAM);
    if (!isNDXClientId(clientid)) {
      options.logger?.warn("agent.socket.upgrade.rejected", { path: requestUrl.pathname, reason: "invalid_clientid" });
      socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nclientid must be a uuid.");
      socket.destroy();
      return;
    }

    socketServer.handleUpgrade(request, socket, head, (webSocket) => {
      options.logger?.info("agent.socket.upgrade.accepted", { clientid });
      void handleSessionConnection(webSocket, clientid, connectedClients, options.database, options.logger, options.resource);
    });
  });

  startSessionHeartbeat(socketServer, connectedClients, heartbeatIntervalMs, heartbeatFailureLimit, options.logger);

  return socketServer;
}
