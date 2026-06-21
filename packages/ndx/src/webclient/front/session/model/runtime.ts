import type { NDXCotWorkContents, NDXSessionRequestQueueItem } from "ndx/common/protocol";
import type { NDXAgentWebContextUsage } from "../chat.js";

export type SessionRuntimeModel = {
  agentRunning: boolean;
  compactRunning: boolean;
  cotWork?: NDXCotWorkContents;
  requestQueue: NDXSessionRequestQueueItem[];
  requestQueueCollapsed: boolean;
  contextUsage?: NDXAgentWebContextUsage;
  notice: string;
  error: string;
};

export function createSessionRuntimeModel(): SessionRuntimeModel {
  return {
    agentRunning: false,
    compactRunning: false,
    requestQueue: [],
    requestQueueCollapsed: true,
    notice: "",
    error: ""
  };
}
