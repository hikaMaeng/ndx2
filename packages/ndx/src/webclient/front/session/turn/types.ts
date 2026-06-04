import type { NDXSessionEventMessage, NDXSessionIterationSummary, NDXSessionTurnSummary } from "ndx/common/protocol";

export type TurnFlowStatus = NDXSessionTurnSummary["status"];
export type TurnIterationNumber = NDXSessionIterationSummary["iteration"];
export type TurnInputDataId = NDXSessionTurnSummary["inputDataId"];
export type TurnSessionId = NDXSessionTurnSummary["sessionid"];

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
  iteration: TurnIterationNumber;
  collapsed: boolean;
  manuallyExpanded?: boolean;
  assistantText: string;
  reasoningText: string;
  modelEvents: string[];
  tools: TurnToolState[];
};

export type TurnFlowState = {
  id: string;
  inputDataId: TurnInputDataId;
  sessionid: TurnSessionId;
  title: NDXSessionTurnSummary["title"];
  status: TurnFlowStatus;
  collapsed: boolean;
  createdAt: NDXSessionTurnSummary["createdat"];
  updatedAt: NDXSessionTurnSummary["updatedat"];
  batches: TurnBatchState[];
};

export type TurnEventMessage = NDXSessionEventMessage;
