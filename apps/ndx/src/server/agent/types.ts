import type { NDXDatabase } from "ndx/agent/init";
import type { NDXAgentResourceResolver } from "ndx/common";
import type { NDXAgentLanguage } from "ndx/common";
import type { NDXLogger } from "ndx/common";
import type { WebSocket } from "ws";

export type SessionClientState = {
  clientid: string;
  socket: WebSocket;
  projectName?: string;
  language?: NDXAgentLanguage;
  grants: Map<string, {
    sessionid: string;
    projectName: string;
    createdat: Date;
  }>;
  missedPings: number;
  pongSinceLastPing: boolean;
};

export type AttachSessionSocketServerOptions = {
  database: NDXDatabase;
  path?: string;
  heartbeatIntervalMs?: number;
  heartbeatFailureLimit?: number;
  logger?: NDXLogger;
  resource?: NDXAgentResourceResolver;
};
