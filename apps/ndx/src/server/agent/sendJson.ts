import { WebSocket } from "ws";
import type { NDXLogger } from "ndx/common";
import type { NDXSocketServerMessage } from "ndx/common/protocol";
import { SOCKET_BACKPRESSURE_BYTES, SOCKET_SEND_SLOW_MS } from "./monitor.js";
import type { SessionClientState } from "./types.js";

export type SendJsonOptions = {
  logger?: NDXLogger;
  sessionid?: string;
  event?: string;
  targetCount?: number;
  slowThresholdMs?: number;
  backpressureThresholdBytes?: number;
};

export async function sendJson(client: SessionClientState, message: NDXSocketServerMessage, options: SendJsonOptions = {}) {
  if (client.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const startedAt = Date.now();
  const payload = JSON.stringify(message);
  const beforeBufferedBytes = client.socket.bufferedAmount;
  const backpressureThresholdBytes = options.backpressureThresholdBytes ?? SOCKET_BACKPRESSURE_BYTES;
  if (beforeBufferedBytes > backpressureThresholdBytes) {
    options.logger?.warn("agent.socket.send.backpressure", {
      clientid: client.clientid,
      sessionid: options.sessionid,
      messageType: message.type,
      event: options.event,
      beforeBufferedBytes,
      backpressureThresholdBytes
    });
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    client.socket.send(payload, finish);
    if (client.socket.send.length < 2) {
      finish();
    }
  }).catch((error) => {
    options.logger?.warn("agent.socket.send.failed", {
      clientid: client.clientid,
      sessionid: options.sessionid,
      messageType: message.type,
      event: options.event,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  });

  const durationMs = Date.now() - startedAt;
  const afterBufferedBytes = client.socket.bufferedAmount;
  if (durationMs > (options.slowThresholdMs ?? SOCKET_SEND_SLOW_MS)) {
    options.logger?.warn("agent.socket.send.slow", {
      clientid: client.clientid,
      sessionid: options.sessionid,
      messageType: message.type,
      event: options.event,
      targetCount: options.targetCount,
      bytes: payload.length,
      durationMs,
      thresholdMs: options.slowThresholdMs ?? SOCKET_SEND_SLOW_MS,
      beforeBufferedBytes,
      afterBufferedBytes
    });
  }
}
