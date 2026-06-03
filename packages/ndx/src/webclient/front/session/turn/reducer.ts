import type { NDXSessionEventMessage } from "ndx/common/protocol";
import { NDX_TURN_EVENT } from "ndx/common/protocol";
import { eventContentText, toolCallIdFromCall, toolNameFromCall, toolProgressText } from "./eventText.js";
import type { TurnBatchState, TurnFlowState, TurnToolState } from "./types.js";

export function applyTurnEvent(turns: TurnFlowState[], message: NDXSessionEventMessage): TurnFlowState[] {
  const now = message.createdat || new Date().toISOString();
  const current = turns.at(-1);
  const startsTurn = message.event === NDX_TURN_EVENT.InputRecorded || !current || current.status !== "running";
  const turn = startsTurn ? newTurn(message, now) : { ...current, updatedAt: now };
  const base = startsTurn ? turns : turns.slice(0, -1);
  const next = reduceTurn(turn, message, now);
  return [...base, next];
}

function newTurn(message: NDXSessionEventMessage, now: string): TurnFlowState {
  return {
    id: `turn:${message.sessionid}:${message.dataid}`,
    inputDataId: message.dataid,
    sessionid: message.sessionid,
    title: eventContentText(message.contents) || "Turn",
    status: "running",
    collapsed: false,
    createdAt: now,
    updatedAt: now,
    batches: []
  };
}

function reduceTurn(turn: TurnFlowState, message: NDXSessionEventMessage, now: string): TurnFlowState {
  if (message.event === NDX_TURN_EVENT.AssistantDelta) {
    const text = eventContentText(message.contents);
    if (!text.trim()) return turn;
    return updateIteration(turn, eventIteration(message), (batch) => ({ ...batch, assistantText: text }));
  }
  if (message.event === NDX_TURN_EVENT.AssistantReasoning) {
    const text = eventContentText(message.contents);
    if (!text.trim()) return turn;
    return updateIteration(turn, eventIteration(message), (batch) => ({ ...batch, reasoningText: text }));
  }
  if (message.event === NDX_TURN_EVENT.ModelRequest) {
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      modelEvents: batch.modelEvents.includes(modelEventText(message)) ? batch.modelEvents : [...batch.modelEvents, modelEventText(message)]
    }));
  }
  if (message.event === NDX_TURN_EVENT.PrefixDrift) {
    const text = prefixDriftEventText(message);
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      modelEvents: batch.modelEvents.includes(text) ? batch.modelEvents : [...batch.modelEvents, text]
    }));
  }
  if (message.event === NDX_TURN_EVENT.ModelProgress) {
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      modelEvents: batch.modelEvents.includes(modelProgressEventText(message)) ? batch.modelEvents : [...batch.modelEvents, modelProgressEventText(message)]
    }));
  }
  if (message.event === NDX_TURN_EVENT.ModelResume) {
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      modelEvents: batch.modelEvents.includes(modelEventText(message)) ? batch.modelEvents : [...batch.modelEvents, modelEventText(message)]
    }));
  }
  if (message.event === NDX_TURN_EVENT.CompactStarted || message.event === NDX_TURN_EVENT.CompactCompleted) {
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      modelEvents: batch.modelEvents.includes(compactEventText(message)) ? batch.modelEvents : [...batch.modelEvents, compactEventText(message)]
    }));
  }
  if (message.event === NDX_TURN_EVENT.ToolBatchStarted) {
    const nextBatch = batchFromMessage(message);
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      key: batch.key.startsWith(`${turn.id}:iteration:`) ? `tool-batch:${turn.id}:${batch.iteration}` : batch.key,
      tools: mergeBatchTools(batch.tools, nextBatch.tools)
    }));
  }
  if (message.event === NDX_TURN_EVENT.ToolProgress && (message.contents as { kind?: unknown }).kind === "tool_started") {
    return updateIteration(turn, eventIteration(message), (batch) => upsertTool(batch, startedTool(message)));
  }
  if (message.event === NDX_TURN_EVENT.ToolProgress && (message.contents as { kind?: unknown }).kind === "tool_progress") {
    const event = (message.contents as { event?: unknown }).event;
    return updateTool(turn, message, (tool) => ({
      ...tool,
      progress: [...tool.progress, { id: message.dataid, text: toolProgressText(event), receivedAt: String((message.contents as { receivedAt?: unknown }).receivedAt ?? "") }]
    }));
  }
  if (message.event === NDX_TURN_EVENT.ToolProgress && (message.contents as { kind?: unknown }).kind === "tool_interrupt") {
    return updateTool(turn, message, (tool) => ({
      ...tool,
      status: interruptStatus(message.contents),
      progress: [...tool.progress, { id: message.dataid, text: `interrupt: ${String((message.contents as { phase?: unknown }).phase ?? "requested")}` }]
    }));
  }
  if (message.event === NDX_TURN_EVENT.ToolProgress && (message.contents as { kind?: unknown }).kind === "tool_finished") {
    const result = (message.contents as { result?: unknown }).result;
    return updateTool(turn, message, (tool) => ({ ...tool, ...finishedTool(result), result }));
  }
  if (message.event === NDX_TURN_EVENT.ToolResultRecorded) {
    const contents = message.contents as { results?: unknown };
    const results = Array.isArray(contents.results) ? contents.results : [];
    return results.reduce(
      (nextTurn, result) => updateToolFromResult(nextTurn, result, eventIteration(message)),
      { ...turn, updatedAt: now }
    );
  }
  if (message.event === NDX_TURN_EVENT.Interrupted || message.event === NDX_TURN_EVENT.InterruptCompleted) {
    return { ...turn, status: "interrupted", collapsed: true, updatedAt: now };
  }
  if (message.event === NDX_TURN_EVENT.AssistantRecorded) {
    return { ...completeOpenTools(turn), status: "completed", collapsed: true, updatedAt: now };
  }
  return turn;
}

function eventIteration(message: NDXSessionEventMessage): number {
  if (message.contents && typeof message.contents === "object" && typeof (message.contents as { iteration?: unknown }).iteration === "number") {
    return (message.contents as { iteration: number }).iteration;
  }
  const match = message.dataid.match(/:(\d+)(?::|$)/);
  return match ? Number(match[1]) : 1;
}

function modelEventText(message: NDXSessionEventMessage): string {
  const contents = message.contents as { iteration?: unknown; messageCount?: unknown };
  const iteration = typeof contents.iteration === "number" ? `iteration ${contents.iteration}` : "model";
  const count = typeof contents.messageCount === "number" ? `, ${contents.messageCount} messages` : "";
  return `${message.event === NDX_TURN_EVENT.ModelResume ? "Resuming model request" : "Model request"} (${iteration}${count})`;
}

function modelProgressEventText(message: NDXSessionEventMessage): string {
  const contents = message.contents as { elapsedMs?: unknown; message?: unknown };
  if (typeof contents.message === "string" && contents.message.trim()) {
    return contents.message.trim();
  }
  const seconds = typeof contents.elapsedMs === "number" ? Math.max(1, Math.round(contents.elapsedMs / 1000)) : undefined;
  return seconds ? `Model request still running (${seconds}s elapsed). Interrupt the session if you do not want to keep waiting.` : "Model request still running. Interrupt the session if you do not want to keep waiting.";
}

function prefixDriftEventText(message: NDXSessionEventMessage): string {
  const text = eventContentText(message.contents);
  return text.trim() ? `Prefix drift warning: ${text}` : "Prefix drift warning";
}

function compactEventText(message: NDXSessionEventMessage): string {
  const contents = message.contents as { kind?: unknown; percent?: unknown; remainingTokens?: unknown; requiredTokens?: unknown; sourceRowCount?: unknown; summaryTokens?: unknown };
  if (contents.kind === "compact_completed") {
    const rows = typeof contents.sourceRowCount === "number" ? `, ${contents.sourceRowCount} rows` : "";
    const summary = typeof contents.summaryTokens === "number" ? `, ${contents.summaryTokens} summary tokens` : "";
    return `Context compact completed${rows}${summary}`;
  }
  const percent = typeof contents.percent === "number" ? `, ${contents.percent}% used` : "";
  const remaining = typeof contents.remainingTokens === "number" && typeof contents.requiredTokens === "number" ? `, ${contents.remainingTokens}/${contents.requiredTokens} tokens remaining/required` : "";
  return `Context compact started${percent}${remaining}`;
}

function batchFromMessage(message: NDXSessionEventMessage): TurnBatchState {
  const contents = message.contents as { iteration?: unknown; toolCalls?: unknown };
  const calls = Array.isArray(contents.toolCalls) ? contents.toolCalls : [];
  return {
    key: message.dataid,
    iteration: typeof contents.iteration === "number" ? contents.iteration : 1,
    collapsed: false,
    manuallyExpanded: false,
    assistantText: "",
    reasoningText: "",
    modelEvents: [],
    tools: calls.map((toolCall, index) => ({
      key: toolCallIdFromCall(toolCall) ?? `${message.dataid}:${index}`,
      tool: toolNameFromCall(toolCall),
      callId: toolCallIdFromCall(toolCall),
      args: toolArgumentsFromCall(toolCall),
      status: "queued",
      progress: []
    }))
  };
}

function startedTool(message: NDXSessionEventMessage): TurnToolState {
  const contents = message.contents as { tool?: unknown; callId?: unknown; args?: unknown; startedAt?: unknown };
  return {
    key: typeof contents.callId === "string" ? contents.callId : `${message.dataid}:${String(contents.tool ?? "tool")}`,
    tool: typeof contents.tool === "string" ? contents.tool : "unknown tool",
    callId: typeof contents.callId === "string" ? contents.callId : undefined,
    args: contents.args && typeof contents.args === "object" && !Array.isArray(contents.args) ? contents.args as Record<string, unknown> : undefined,
    status: "running",
    startedAt: typeof contents.startedAt === "string" ? contents.startedAt : undefined,
    progress: []
  };
}

function finishedTool(result: unknown): Partial<TurnToolState> {
  if (!result || typeof result !== "object") return { status: "failed" };
  const record = result as { status?: unknown; success?: unknown; endedAt?: unknown };
  const status = record.status === "cancelled" || record.status === "timeout" ? record.status : record.success === false ? "failed" : "succeeded";
  return { status, endedAt: typeof record.endedAt === "string" ? record.endedAt : undefined };
}

function interruptStatus(contents: unknown): TurnToolState["status"] {
  const status = contents && typeof contents === "object" ? (contents as { status?: unknown }).status : undefined;
  return status === "timeout" ? "timeout" : "cancelled";
}

function updateIteration(turn: TurnFlowState, iteration: number, update: (batch: TurnBatchState) => TurnBatchState): TurnFlowState {
  const existingIndex = turn.batches.findIndex((batch) => batch.iteration === iteration);
  if (existingIndex >= 0) {
    const previousIteration = Math.max(0, ...turn.batches.filter((batch) => batch.iteration < iteration).map((batch) => batch.iteration));
    const batches = turn.batches.map((batch, index) => {
      if (index === existingIndex) return { ...update(batch), collapsed: false };
      if (batch.iteration === previousIteration && !batch.manuallyExpanded) return { ...batch, collapsed: true };
      return batch;
    });
    return { ...turn, batches };
  }
  const previousIteration = Math.max(0, ...turn.batches.map((batch) => batch.iteration));
  return {
    ...turn,
    batches: [
      ...turn.batches.map((batch) => batch.iteration === previousIteration && !batch.manuallyExpanded ? { ...batch, collapsed: true } : batch),
      update(emptyIteration(turn, iteration))
    ]
  };
}

function emptyIteration(turn: TurnFlowState, iteration: number): TurnBatchState {
  return {
    key: `${turn.id}:iteration:${iteration}`,
    iteration,
    collapsed: false,
    manuallyExpanded: false,
    assistantText: "",
    reasoningText: "",
    modelEvents: [],
    tools: []
  };
}

function updateTool(turn: TurnFlowState, message: NDXSessionEventMessage, update: (tool: TurnToolState) => TurnToolState): TurnFlowState {
  const contents = message.contents as { tool?: unknown; callId?: unknown; result?: unknown };
  const result = contents.result && typeof contents.result === "object" ? contents.result as { tool?: unknown; callId?: unknown; toolCallId?: unknown } : undefined;
  const callId = typeof contents.callId === "string" ? contents.callId : typeof result?.callId === "string" ? result.callId : typeof result?.toolCallId === "string" ? result.toolCallId : undefined;
  const toolName = typeof contents.tool === "string" ? contents.tool : typeof result?.tool === "string" ? result.tool : undefined;
  return updateIteration(turn, eventIteration(message), (batch) => ({
    ...batch,
    tools: batch.tools.map((tool) => (callId ? tool.callId === callId : tool.tool === toolName) ? update(tool) : tool)
  }));
}

function updateToolFromResult(turn: TurnFlowState, result: unknown, iteration: number): TurnFlowState {
  if (!result || typeof result !== "object") return turn;
  const record = result as { toolCallId?: unknown; tool?: unknown; success?: unknown };
  const callId = typeof record.toolCallId === "string" ? record.toolCallId : undefined;
  const toolName = typeof record.tool === "string" ? record.tool : undefined;
  return updateIteration(turn, iteration, (batch) => ({
    ...batch,
    tools: batch.tools.map((tool) => (callId ? tool.callId === callId : tool.tool === toolName) ? { ...tool, status: record.success === false ? "failed" : "succeeded", result } : tool)
  }));
}

function completeOpenTools(turn: TurnFlowState): TurnFlowState {
  return {
    ...turn,
    batches: turn.batches.map((batch) => ({
      ...batch,
      tools: batch.tools.map((tool) => tool.status === "queued" || tool.status === "running" ? { ...tool, status: "failed" } : tool)
    }))
  };
}

function upsertTool(batch: TurnBatchState, nextTool: TurnToolState): TurnBatchState {
  const found = batch.tools.some((tool) => tool.callId ? tool.callId === nextTool.callId : tool.tool === nextTool.tool);
  return {
    ...batch,
    tools: found ? batch.tools.map((tool) => (tool.callId ? tool.callId === nextTool.callId : tool.tool === nextTool.tool) ? { ...tool, ...nextTool, progress: tool.progress } : tool) : [...batch.tools, nextTool]
  };
}

function mergeBatchTools(currentTools: TurnToolState[], nextTools: TurnToolState[]): TurnToolState[] {
  return nextTools.reduce((tools, nextTool) => upsertTool({ key: "batch", iteration: 0, collapsed: false, assistantText: "", reasoningText: "", modelEvents: [], tools }, nextTool).tools, currentTools);
}

function toolArgumentsFromCall(toolCall: unknown): Record<string, unknown> | undefined {
  if (!toolCall || typeof toolCall !== "object") return undefined;
  const record = toolCall as { arguments?: unknown; input?: unknown; function?: unknown };
  const raw = record.arguments ?? record.input ?? (record.function && typeof record.function === "object" ? (record.function as { arguments?: unknown }).arguments : undefined);
  if (typeof raw === "string") {
    const parsed = parseJsonObject(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { input: raw };
  }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
}

function parseJsonObject(text: string): unknown {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
