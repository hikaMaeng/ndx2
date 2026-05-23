import type { NDXSessionEventMessage } from "ndx/agent/common/protocol";
import type { NDXSidebarItem } from "ndx/agent/common/protocol";

export type TurnToolState = {
  key: string;
  tool: string;
  callId?: string;
  args?: Record<string, unknown>;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timeout";
  startedAt?: string;
  endedAt?: string;
  progress: Array<{ id: string; text: string; receivedAt?: string }>;
  result?: unknown;
};

export type TurnBatchState = {
  key: string;
  iteration: number;
  collapsed: boolean;
  assistantText: string;
  reasoningText: string;
  modelEvents: string[];
  tools: TurnToolState[];
};

export type TurnFlowState = {
  id: string;
  inputDataId: string;
  sessionid: string;
  title: string;
  status: "running" | "interrupted" | "completed";
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
  sidebarItems: NDXSidebarItem[];
  batches: TurnBatchState[];
};

export type TurnEventMessage = NDXSessionEventMessage;
