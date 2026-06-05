import type { NDXContextUsage } from "../contextusage/index.js";
import type { NDXCompactReport } from "../compact/index.js";
import type { NDXHookCompactEffect, NDXHookRuntime, NDXModelRequestPrefixDrift } from "../hook/index.js";
import type { NDXAgentRuntimeSettings } from "../runtime-settings/index.js";
import type { NDXModelConfig, NDXSessionDataRow, NDXSessionRow } from "../session/types.js";
import type { NDXResolvedTool, NDXToolExecutionResult, NDXToolProcessEvent } from "../tool/types.js";
import type { NDXSessionClientBridge } from "../tool/types.js";
import type { NDXCotWorkContents, NDXSessionAttachmentReference, NDXSidebarItem, NDX_TURN_EVENT } from "../../common/protocol/index.js";
import type { NDXAgentLanguage, NDXAgentResourceResolver } from "../../common/resource/index.js";
import type { ModelResponse, ResponseInputItem } from "ndx/common/responseapi";
import type { NDXTurnMessageParts } from "./base/context/index.js";
import type { NDXCotWorkTimingTracker } from "../tool/base/cot_work/timing.js";
import type { NDXTurnInterruptScope } from "./base/interrupt/index.js";

export type NDXTurnInput = {
  text: string;
  attachments?: NDXSessionAttachmentReference[];
};

// Internal turn-loop observer events. Socket messages are defined in agent/common/protocol.
export type NDXTurnLoopEvent =
  | { type: typeof NDX_TURN_EVENT.InputRecorded; input: NDXSessionDataRow; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ContextReady; messageCount: number; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.CompactStarted; report: NDXCompactReport; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.CompactCompleted; report: NDXCompactReport; compact: NDXSessionDataRow; sourceRowCount: number; summaryTokens: number; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ModelRequest; iteration: number; messages: ResponseInputItem[]; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.PrefixDrift; iteration: number; drift: NDXModelRequestPrefixDrift; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ModelProgress; iteration: number; elapsedMs: number; intervalMs: number; message: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ModelResume; iteration: number; results: NDXToolExecutionResult[]; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.AssistantDelta; iteration: number; delta: string; content: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.AssistantReasoning; iteration: number; summary: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolCallRecorded; iteration: number; data: NDXSessionDataRow; toolCall: unknown; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolBatchStarted; iteration: number; toolCalls: unknown[]; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolProgress; status: "started"; iteration: number; tool: string; callId?: string; args: Record<string, unknown>; startedAt: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolProgress; status: "progress"; iteration: number; tool: string; callId?: string; event: NDXToolProcessEvent; receivedAt: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.SidebarItem; iteration: number; tool: string; callId?: string; item: NDXSidebarItem; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.CotWork; iteration: number; tool: string; callId?: string; contents: NDXCotWorkContents; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolProgress; status: "cancelled" | "timeout"; iteration: number; tool: string; callId?: string; phase: string; signal?: NodeJS.Signals | null; receivedAt: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolProgress; status: "finished"; iteration: number; result: NDXToolExecutionResult; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolResultRecorded; iteration: number; data: NDXSessionDataRow; results: NDXToolExecutionResult[]; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.Interrupted; phase: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.InterruptCompleted; phase: string; session: NDXSessionRow; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.AssistantRecorded; iteration: number; assistant: NDXSessionDataRow; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.TurnEnd; iteration: number; session: NDXSessionRow; contextUsage: NDXContextUsage };

export type NDXTurnLoopEvents = {
  onEvent?: (event: NDXTurnLoopEvent) => Promise<void>;
  hooks?: NDXHookRuntime;
  language?: NDXAgentLanguage;
  resource?: NDXAgentResourceResolver;
  sessionClientBridge?: NDXSessionClientBridge;
};

export type NDXTurnTranslate = (key: Parameters<NDXAgentResourceResolver>[0], values?: Record<string, string | number>) => string;

export type NDXTurnPipelineContinuations = {
  prepareBeforeLoop: (state: NDXActiveTurnPipelineState) => Promise<void>;
  prepareTurnIteration: (state: NDXActiveTurnPipelineState) => Promise<void>;
  callTurnModel: (state: NDXActiveTurnPipelineState, options?: { finalizingAfterIterationLimit?: boolean; contextUsage?: NDXContextUsage }) => Promise<void>;
  handleModelResponse: (state: NDXActiveTurnPipelineState, response: ModelResponse) => Promise<void>;
  processToolCalls: (state: NDXActiveTurnPipelineState, response: ModelResponse) => Promise<void>;
  finishAfterLoop: (state: NDXActiveTurnPipelineState) => Promise<void>;
  finishCompactTurn: (state: NDXActiveTurnPipelineState, compactEffect: NDXHookCompactEffect, contextRows: NDXSessionDataRow[], contextUsage: NDXContextUsage) => Promise<void>;
  handleTurnFailure: (state: NDXTurnPipelineState, error: unknown) => Promise<void>;
};

export type NDXTurnPipelineState = {
  database: import("../session/types.js").NDXDatabase;
  sourceSession: NDXSessionRow;
  request: NDXTurnInput;
  model?: NDXModelConfig;
  events: NDXTurnLoopEvents;
  pipeline: NDXTurnPipelineContinuations;

  requestText: string;
  text?: string;
  attachments: NDXSessionAttachmentReference[];
  assistantText: string;
  activeIteration: number;
  finalIteration: number;

  runningSession?: NDXSessionRow;
  input?: NDXSessionDataRow;
  language?: NDXAgentLanguage;
  resource?: NDXAgentResourceResolver;
  t?: NDXTurnTranslate;
  userHome?: string;
  projectHome?: string;
  runtimeSettings?: NDXAgentRuntimeSettings;
  hookRuntime?: NDXHookRuntime;
  interrupt?: NDXTurnInterruptScope;
  messageParts?: NDXTurnMessageParts;
  currentMessageParts?: NDXTurnMessageParts;
  messages: ResponseInputItem[];
  lastModelRequestMessages?: ResponseInputItem[];
  availableTools: NDXResolvedTool[];
  modelTools: Record<string, unknown>[];
  inputContextUsage?: NDXContextUsage;
  cotWorkTiming?: NDXCotWorkTimingTracker;
  turnContextUsage?: (extraContent?: string, tools?: unknown[], inputMessages?: ResponseInputItem[]) => NDXContextUsage;
};

export type NDXActiveTurnPipelineState = NDXTurnPipelineState & {
  runningSession: NDXSessionRow;
  input: NDXSessionDataRow;
  text: string;
  language: NDXAgentLanguage;
  resource: NDXAgentResourceResolver;
  t: NDXTurnTranslate;
  userHome: string;
  projectHome: string;
  runtimeSettings: NDXAgentRuntimeSettings;
  hookRuntime: NDXHookRuntime;
  interrupt: NDXTurnInterruptScope;
  messageParts: NDXTurnMessageParts;
  currentMessageParts?: NDXTurnMessageParts;
  cotWorkTiming: NDXCotWorkTimingTracker;
  turnContextUsage: (extraContent?: string, tools?: unknown[], inputMessages?: ResponseInputItem[]) => NDXContextUsage;
};
