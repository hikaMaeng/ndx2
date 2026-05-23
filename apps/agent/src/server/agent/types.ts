import type { NDXDatabase } from "ndx/agent/server";
import type { NDXAgentResourceResolver } from "ndx/agent/common";
import type { NDXAgentLanguage } from "ndx/agent/common";
import type { NDXLogger } from "ndx/common";
import type { WebSocket } from "ws";

export type SessionClientState = {
  clientid: string;
  socket: WebSocket;
  userid?: string;
  projectId?: string;
  projectPath?: string;
  language?: NDXAgentLanguage;
  grants: Map<string, {
    sessionid: string;
    userid: string;
    projectId: string;
    projectPath: string;
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
