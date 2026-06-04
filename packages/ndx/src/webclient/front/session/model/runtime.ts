import type { NDXCotWorkContents } from "ndx/common/protocol";
import type { NDXAgentWebContextUsage } from "../chat.js";

export type SessionRuntimeModel = {
  agentRunning: boolean;
  compactRunning: boolean;
  cotWork?: NDXCotWorkContents;
  contextUsage?: NDXAgentWebContextUsage;
  notice: string;
  error: string;
};

export function createSessionRuntimeModel(): SessionRuntimeModel {
  return {
    agentRunning: false,
    compactRunning: false,
    notice: "",
    error: ""
  };
}
