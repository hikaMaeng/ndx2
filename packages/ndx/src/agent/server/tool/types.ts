import type { NDXTurnMessageParts } from "../turnloop/messages.js";
import type { NDXToolAgentCallHandlers } from "./execute/agentcall/index.js";

export type NDXToolScope = "user" | "project" | "builtin";

export const NDX_TOOL_RUNTIME_ARG_NAMES = ["$SKILL_LIST", "$LOADED_SKILL"] as const;

export type NDXToolRuntimeArgName = typeof NDX_TOOL_RUNTIME_ARG_NAMES[number];

export type NDXToolRuntimeTurnContext = NDXTurnMessageParts;

export type NDXToolDefinitionFile = {
  tool?: {
    command?: unknown;
    args?: unknown;
    env?: unknown;
    stdin?: unknown;
  };
  schema?: unknown;
};

export type NDXResolvedTool = {
  name: string;
  source: NDXToolScope;
  directory: string;
  definitionPath: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  stdin?: string;
  schema: Record<string, unknown>;
};

export type NDXToolRegistryOptions = {
  userHome?: string;
  projectHome?: string;
  hostRoot?: string;
  containerRoot?: string;
  containerWorkspace?: string;
  containerUserHome?: string;
  containerNdxHome?: string;
};

export type NDXToolExecutionOptions = NDXToolRegistryOptions & {
  cwd?: string;
  extraEnv?: Record<string, string | undefined>;
  sessionid?: string;
  turnContext?: NDXToolRuntimeTurnContext;
  timeoutMs?: number;
  killGraceMs?: number;
  signal?: AbortSignal;
  observer?: NDXToolExecutionObserver;
  agentCallHandlers?: NDXToolAgentCallHandlers;
};

export type NDXToolProcessEvent =
  | { type: "progress"; message: string; data?: unknown; percent?: number }
  | { type: "result"; success: true; output: unknown; effects?: NDXToolResultEffect[] }
  | { type: "error"; success: false; message: string; output?: unknown; effects?: NDXToolResultEffect[] }
  | { type: "debug"; message: string; data?: unknown };

export type NDXToolResultEffect =
  | {
      type: "append_user_message";
      text?: string;
      attachments?: Array<{
        kind?: "image" | "file";
        path: string;
        name?: string;
        mimeType: string;
        size?: number;
      }>;
    }
  | { type: "inline_appended_user_message" };

export type NDXToolExecutionStatus = "success" | "failed" | "cancelled" | "timeout" | "spawn_error" | "protocol_error";

export type NDXToolExecutionObserver = {
  onToolStarted?: (event: { tool: string; callId?: string; startedAt: string; args: Record<string, unknown> }) => void | Promise<void>;
  onToolProgress?: (event: { tool: string; callId?: string; event: NDXToolProcessEvent; receivedAt: string }) => void | Promise<void>;
  onToolInterrupt?: (event: { tool: string; callId?: string; phase: "requested" | "sigterm" | "sigkill" | "exited"; status: "cancelled" | "timeout"; signal?: NodeJS.Signals | null; receivedAt: string }) => void | Promise<void>;
  onToolFinished?: (result: NDXToolExecutionResult) => void | Promise<void>;
};

export type NDXToolExecutionResult = {
  tool: string;
  callId?: string;
  status: NDXToolExecutionStatus;
  success: boolean;
  output: string;
  outputValue?: unknown;
  effects?: NDXToolResultEffect[];
  events: NDXToolProcessEvent[];
  stdoutText: string;
  stderrText: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  error?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
};
