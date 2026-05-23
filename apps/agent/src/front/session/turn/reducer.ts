import type { NDXSessionEventMessage } from "ndx/agent/common/protocol";
import { NDX_TURN_EVENT, parseNDXSidebarItem } from "ndx/agent/common/protocol";
import { eventContentText, toolCallIdFromCall, toolNameFromCall, toolProgressText } from "./eventText";
import type { TurnBatchState, TurnFlowState, TurnToolState } from "./types";

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
    sidebarItems: [],
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
  if (message.event === NDX_TURN_EVENT.ModelResume) {
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      modelEvents: batch.modelEvents.includes(modelEventText(message)) ? batch.modelEvents : [...batch.modelEvents, modelEventText(message)]
    }));
  }
  if (message.event === NDX_TURN_EVENT.ToolBatchStarted) {
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      key: batch.key.startsWith(`${turn.id}:iteration:`) ? `tool-batch:${turn.id}:${batch.iteration}` : batch.key,
      tools: batchFromMessage(message).tools
    }));
  }
  if (message.event === NDX_TURN_EVENT.ToolProgress && (message.contents as { kind?: unknown }).kind === "tool_started") {
    return updateIteration(turn, eventIteration(message), (batch) => upsertTool(batch, startedTool(message)));
  }
  if (message.event === NDX_TURN_EVENT.ToolProgress && (message.contents as { kind?: unknown }).kind === "tool_progress") {
    const event = (message.contents as { event?: unknown }).event;
    const sidebarItem = event && typeof event === "object"
      ? parseNDXSidebarItem(
        typeof (event as { message?: unknown }).message === "string" ? (event as { message: string }).message : "",
        (event as { data?: unknown }).data
      )
      : undefined;
    const turnWithSidebar = sidebarItem ? upsertSidebarItem(turn, sidebarItem) : turn;
    if (sidebarItem) {
      return updateTool(turnWithSidebar, message, (tool) => ({ ...tool, progress: tool.progress }));
    }
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
    const nextTurn = updateTool(turn, message, (tool) => ({ ...tool, ...finishedTool(result), result }));
    return upsertSidebarItemFromResult(upsertChangedFileFromResult(nextTurn, result), result);
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

function batchFromMessage(message: NDXSessionEventMessage): TurnBatchState {
  const contents = message.contents as { iteration?: unknown; toolCalls?: unknown };
  const calls = Array.isArray(contents.toolCalls) ? contents.toolCalls : [];
  return {
    key: message.dataid,
    iteration: typeof contents.iteration === "number" ? contents.iteration : 1,
    collapsed: false,
    assistantText: "",
    reasoningText: "",
    modelEvents: [],
    tools: calls.map((toolCall, index) => ({
      key: toolCallIdFromCall(toolCall) ?? `${message.dataid}:${index}`,
      tool: toolNameFromCall(toolCall),
      callId: toolCallIdFromCall(toolCall),
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
    const batches = turn.batches.map((batch, index) => index === existingIndex ? { ...update(batch), collapsed: false } : { ...batch, collapsed: true });
    return { ...turn, batches };
  }
  return {
    ...turn,
    batches: [
      ...turn.batches.map((batch) => ({ ...batch, collapsed: true })),
      update(emptyIteration(turn, iteration))
    ]
  };
}

function emptyIteration(turn: TurnFlowState, iteration: number): TurnBatchState {
  return {
    key: `${turn.id}:iteration:${iteration}`,
    iteration,
    collapsed: false,
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
  const nextTurn = updateIteration(turn, iteration, (batch) => ({
    ...batch,
    tools: batch.tools.map((tool) => (callId ? tool.callId === callId : tool.tool === toolName) ? { ...tool, status: record.success === false ? "failed" : "succeeded", result } : tool)
  }));
  return upsertSidebarItemFromResult(upsertChangedFileFromResult(nextTurn, result), result);
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

function upsertSidebarItem(turn: TurnFlowState, item: TurnFlowState["sidebarItems"][number]): TurnFlowState {
  const key = item.key ?? `${item.group.id}:${item.kind ?? "item"}:${item.title}:${item.body ?? ""}`;
  const items = turn.sidebarItems.filter((current) => {
    const currentKey = current.key ?? `${current.group.id}:${current.kind ?? "item"}:${current.title}:${current.body ?? ""}`;
    return currentKey !== key;
  });
  return { ...turn, sidebarItems: [...items, { ...item, key }] };
}

function upsertChangedFileFromResult(turn: TurnFlowState, result: unknown): TurnFlowState {
  const changedFile = changedFileSidebarItem(result);
  return changedFile ? upsertSidebarItem(turn, changedFile) : turn;
}

function upsertSidebarItemFromResult(turn: TurnFlowState, result: unknown): TurnFlowState {
  const sidebarItem = sidebarItemFromToolResult(result);
  return sidebarItem ? upsertSidebarItem(turn, sidebarItem) : turn;
}

function sidebarItemFromToolResult(result: unknown): TurnFlowState["sidebarItems"][number] | undefined {
  if (!result || typeof result !== "object") return undefined;
  const record = result as { tool?: unknown; success?: unknown; output?: unknown };
  if (record.success === false || typeof record.tool !== "string" || typeof record.output !== "string") return undefined;

  if (record.tool === "read_file") {
    try {
      const parsed = JSON.parse(record.output) as unknown;
      const path = parsed && typeof parsed === "object" && typeof (parsed as { path?: unknown }).path === "string" ? (parsed as { path: string }).path : undefined;
      if (!path || path.trim().length === 0) return undefined;
      return {
        group: { id: "file-references", title: "파일참조" },
        key: `file-reference:${path}`,
        title: path.split(/[\\/]/).pop() || path,
        body: path,
        kind: "file_reference"
      };
    } catch {
      return undefined;
    }
  }

  if (record.tool === "loadSkill") {
    const name = record.output.match(/<skill>\s*<name>([^<]+)<\/name>/)?.[1]?.trim();
    const path = record.output.match(/<path>([^<]+)<\/path>/)?.[1]?.trim();
    if (!name) return undefined;
    return {
      group: { id: "skills", title: "스킬" },
      key: `skill:${name}:${path ?? ""}`,
      title: name,
      ...(path ? { body: path } : {}),
      kind: "skill"
    };
  }

  return undefined;
}

function changedFileSidebarItem(result: unknown): TurnFlowState["sidebarItems"][number] | undefined {
  if (!result || typeof result !== "object") return undefined;
  const record = result as { tool?: unknown; success?: unknown; output?: unknown; outputValue?: unknown };
  if (record.success === false || (record.tool !== "write_file" && record.tool !== "edit")) {
    return undefined;
  }
  const outputValue = record.outputValue && typeof record.outputValue === "object" ? record.outputValue as { path?: unknown } : undefined;
  let path = typeof outputValue?.path === "string" ? outputValue.path : undefined;
  if (!path && typeof record.output === "string") {
    try {
      const parsed = JSON.parse(record.output) as unknown;
      if (parsed && typeof parsed === "object" && typeof (parsed as { path?: unknown }).path === "string") {
        path = (parsed as { path: string }).path;
      }
    } catch {
      path = undefined;
    }
  }
  if (!path || path.trim().length === 0) return undefined;
  return {
    group: { id: "changed-files", title: "변경 파일" },
    key: `changed-file:${path}`,
    title: path.split(/[\\/]/).pop() || path,
    body: path,
    kind: typeof record.tool === "string" ? record.tool : "file"
  };
}
