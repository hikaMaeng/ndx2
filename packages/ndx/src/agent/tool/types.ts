import type { NDXTurnMessageParts } from "../turnloop/base/context/index.js";
import type { NDXToolAgentCallHandlers } from "./execute/agentcall/index.js";
import type { NDXAskUserQuestionRequest, NDXAskUserQuestionResponse } from "../../common/protocol/index.js";
import type { NDXDatabase, NDXModelConfig, NDXSessionRow } from "../session/types.js";

export type NDXToolScope = "user" | "project" | "builtin";

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
  runtime?: "process" | "function";
  command: string;
  args: string[];
  env: Record<string, string>;
  stdin?: string;
  schema: Record<string, unknown>;
};

export type NDXToolRegistryOptions = {
  userHome?: string;
  projectHome?: string;
  allowedToolNames?: readonly string[];
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
  turnId?: string;
  iteration?: number;
  turnContext?: NDXToolRuntimeTurnContext;
  timeoutMs?: number;
  killGraceMs?: number;
  toolCallIndex?: number;
  denyToolResultEffects?: boolean;
  signal?: AbortSignal;
  observer?: NDXToolExecutionObserver;
  agentCallHandlers?: NDXToolAgentCallHandlers;
  sessionClientBridge?: NDXSessionClientBridge;
  database?: NDXDatabase;
  session?: NDXSessionRow;
  model?: NDXModelConfig;
};

export type NDXSessionClientBridge = {
  requestUserQuestion: (request: Omit<NDXAskUserQuestionRequest, "sessionid">, options?: { signal?: AbortSignal }) => Promise<NDXAskUserQuestionResponse | undefined>;
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
  tool_transport_error?: string;
  raw_output_path?: string;
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
