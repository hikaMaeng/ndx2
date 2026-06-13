import type { NDXCotWorkContents } from "../turn/index.js";

export type NDXToolResultContents = {
  toolCallId: string;
  tool: string;
  success: boolean;
  output: unknown;
};

export type NDXSessionAttachmentReference = {
  kind: "image" | "file";
  path: string;
  name: string;
  mimeType: string;
  size: number;
};

export type NDXSessionDataContents =
  | { kind: "user_message"; text: string; attachments?: NDXSessionAttachmentReference[] }
  | { kind: "tool_generated_user_message"; text: string; attachments?: NDXSessionAttachmentReference[]; sources?: Array<{ tool: string; toolCallId?: string; iteration?: number }> }
  | { kind: "assistant_message"; text: string }
  | { kind: "compact"; text: string; previousCompactDataId?: string; sourceStartDataId?: string; sourceEndDataId?: string; sourceRowCount: number; createdReason: string; sourceInput?: { dataId: string; text: string } }
  | { kind: "compact_started"; phase: "turn_start" | "iteration"; reason: string; tokens: number; contextsize: number; percent: number; remainingTokens: number; requiredTokens: number; averageTurnTokens: number; outputReserveTokens: number }
  | { kind: "compact_completed"; phase: "turn_start" | "iteration"; reason: string; compactDataId: string; sourceRowCount: number; summaryTokens: number; tokens: number; contextsize: number; percent: number; remainingTokens: number; requiredTokens: number; averageTurnTokens: number; outputReserveTokens: number }
  | { kind: "assistant_delta"; iteration: number; delta: string; content: string }
  | { kind: "assistant_reasoning"; iteration: number; summary: string }
  | { kind: "prefix_drift"; iteration: number; label: string; message: string; messageIndex?: number; previousMessageCount: number; nextMessageCount: number; stablePrefixLength: number; previousPreview?: string; nextPreview?: string }
  | { kind: "model_progress"; iteration: number; elapsedMs: number; intervalMs: number; message: string }
  | { kind: "skill_context"; name: string; path: string; text: string }
  | { kind: "tool_call"; iteration: number; toolCalls: unknown[] }
  | { kind: "tool_result"; iteration: number; results: NDXToolResultContents[] }
  | { kind: "cot_work_reminder"; iteration: number; sourceDataId: string; text: string }
  | NDXCotWorkContents
  | { kind: "interrupt"; requestedAt: string }
  | { kind: "error"; message: string };

export type NDXSessionEventName = NDXTurnEventName;

export type NDXSessionEventContextUsage = {
  tokens: number;
  messageTokens?: number;
  toolDefinitionTokens?: number;
  percent: number;
  contextsize: number;
  parts?: Array<{
    key: "developer" | "user" | "history" | "toolDefinitions" | "remaining";
    label: string;
    tokens: number;
    percent: number;
  }>;
};
import type { NDXTurnEventName } from "../turn/index.js";
