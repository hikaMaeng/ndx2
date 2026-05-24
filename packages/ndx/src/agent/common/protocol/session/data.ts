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
  | { kind: "assistant_delta"; iteration: number; delta: string; content: string }
  | { kind: "assistant_reasoning"; iteration: number; summary: string }
  | { kind: "tool_call"; iteration: number; toolCalls: unknown[] }
  | { kind: "tool_result"; iteration: number; results: NDXToolResultContents[] }
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
