import { monitorEventLoopDelay } from "node:perf_hooks";
import type { NDXLogger } from "ndx/common";
import type { WebSocketServer } from "ws";
import type { SessionClientState } from "./types.js";

export const SOCKET_MESSAGE_SLOW_MS = 250;
export const SOCKET_SEND_SLOW_MS = 100;
export const SOCKET_BACKPRESSURE_BYTES = 1024 * 1024;
export const SOCKET_TURN_EVENT_STREAM_FANOUT_SLOW_MS = 150;
export const SOCKET_TURN_EVENT_FANOUT_SLOW_MS = 500;
export const SOCKET_HEARTBEAT_SLOW_PONG_MS = 2_000;
export const RUNTIME_EVENT_LOOP_P95_WARN_MS = 100;
export const RUNTIME_EVENT_LOOP_MAX_WARN_MS = 500;

export function startAgentRuntimeMonitor(
  socketServer: WebSocketServer,
  connectedClients: Map<string, SessionClientState>,
  logger?: NDXLogger,
  intervalMs = 30_000
) {
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  eventLoopDelay.enable();
  const interval = setInterval(() => {
    const clients = [...connectedClients.values()];
    const bufferedBytes = clients.reduce((total, client) => total + client.socket.bufferedAmount, 0);
    const maxBufferedBytes = clients.reduce((max, client) => Math.max(max, client.socket.bufferedAmount), 0);
    const inFlightMessages = clients.reduce((total, client) => total + (client.inFlightMessages ?? 0), 0);
    const p95Ms = Math.round(eventLoopDelay.percentile(95) / 1_000_000);
    const maxMs = Math.round(eventLoopDelay.max / 1_000_000);
    const payload = {
      connectedCount: clients.length,
      inFlightMessages,
      bufferedBytes,
      maxBufferedBytes,
      eventLoopDelayP95Ms: p95Ms,
      eventLoopDelayMaxMs: maxMs
    };
    logger?.debug("agent.runtime.event_loop.summary", payload);
    if (p95Ms > RUNTIME_EVENT_LOOP_P95_WARN_MS || maxMs > RUNTIME_EVENT_LOOP_MAX_WARN_MS) {
      logger?.warn("agent.runtime.event_loop.blocked", {
        ...payload,
        p95ThresholdMs: RUNTIME_EVENT_LOOP_P95_WARN_MS,
        maxThresholdMs: RUNTIME_EVENT_LOOP_MAX_WARN_MS
      });
    }
    eventLoopDelay.reset();
  }, intervalMs);
  interval.unref?.();

  socketServer.on("close", () => {
    clearInterval(interval);
    eventLoopDelay.disable();
  });
}
