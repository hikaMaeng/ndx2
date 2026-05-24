import type { NDXContextUsage } from "../contextusage/index.js";
import type { NDXHookRuntime } from "../hook/index.js";
import type { NDXSessionDataRow, NDXSessionRow } from "../session/types.js";
import type { NDXToolExecutionResult, NDXToolProcessEvent } from "../tool/types.js";
import type { NDXCotWorkContents, NDX_TURN_EVENT } from "../../common/protocol/index.js";
import type { NDXAgentLanguage, NDXAgentResourceResolver } from "../../common/resource/index.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

// Internal turn-loop observer events. Socket messages are defined in agent/common/protocol.
export type NDXTurnLoopEvent =
  | { type: typeof NDX_TURN_EVENT.InputRecorded; input: NDXSessionDataRow; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ContextReady; messageCount: number; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ModelRequest; iteration: number; messages: ResponseInputItem[]; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ModelResume; iteration: number; results: NDXToolExecutionResult[]; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.AssistantDelta; iteration: number; delta: string; content: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.AssistantReasoning; iteration: number; summary: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolCallRecorded; iteration: number; data: NDXSessionDataRow; toolCall: unknown; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolBatchStarted; iteration: number; toolCalls: unknown[]; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolProgress; status: "started"; iteration: number; tool: string; callId?: string; args: Record<string, unknown>; startedAt: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolProgress; status: "progress"; iteration: number; tool: string; callId?: string; event: NDXToolProcessEvent; receivedAt: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.CotWork; iteration: number; tool: string; callId?: string; contents: NDXCotWorkContents; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolProgress; status: "cancelled" | "timeout"; iteration: number; tool: string; callId?: string; phase: string; signal?: NodeJS.Signals | null; receivedAt: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolProgress; status: "finished"; iteration: number; result: NDXToolExecutionResult; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.ToolResultRecorded; iteration: number; data: NDXSessionDataRow; results: NDXToolExecutionResult[]; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.Interrupted; phase: string; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.InterruptCompleted; phase: string; session: NDXSessionRow; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.AssistantRecorded; iteration: number; assistant: NDXSessionDataRow; contextUsage: NDXContextUsage };

export type NDXTurnLoopEvents = {
  onEvent?: (event: NDXTurnLoopEvent) => Promise<void>;
  hooks?: NDXHookRuntime;
  language?: NDXAgentLanguage;
  resource?: NDXAgentResourceResolver;
};
