import { NDX_TURN_EVENT, type NDXSessionEventMessage, type NDXSessionIterationDetailResultMessage, type NDXSessionIterationSummary, type NDXSessionTurnSummary } from "ndx/common/protocol";
import { sessionDataToChatMessage, visibleUserRequestText, type ChatMessage } from "./chat.js";
import { applyTurnEvent, type TurnBatchState, type TurnFlowState } from "./turn/index.js";

export function chatMessageFromSessionEvent(message: NDXSessionEventMessage): ChatMessage | undefined {
  const historyActionsDisabled = message.dataid.startsWith("branch-source:");
  if (message.event === NDX_TURN_EVENT.CompactCompleted && message.contents && typeof message.contents === "object" && (message.contents as { kind?: unknown }).kind === "compact") {
    const text = (message.contents as { text?: unknown }).text;
    return typeof text === "string" && text.trim()
      ? { id: message.dataid, role: "assistant", text, attachments: [] }
      : undefined;
  }
  if (message.event !== NDX_TURN_EVENT.InputRecorded && message.event !== NDX_TURN_EVENT.AssistantRecorded) {
    return undefined;
  }
  const rowType = message.event === NDX_TURN_EVENT.AssistantRecorded ? "assistant" : "user";
  const chatMessage = sessionDataToChatMessage({ dataid: message.dataid, sessionid: message.sessionid, type: rowType, contents: message.contents, createdat: message.createdat });
  return historyActionsDisabled ? { ...chatMessage, historyActionsDisabled } : chatMessage;
}

export function chatMessagesFromHistorySummary(visibleEvents: NDXSessionEventMessage[], turns: NDXSessionTurnSummary[]): ChatMessage[] {
  const visibleMessages = new Map(visibleEvents.flatMap((event) => {
    const message = chatMessageFromSessionEvent(event);
    return message ? [[message.id, message] as const] : [];
  }));
  const used = new Set<string>();
  const messages: ChatMessage[] = [];
  const firstTurnCreatedAt = turns[0]?.createdat;

  for (const event of visibleEvents) {
    if (!firstTurnCreatedAt || event.createdat >= firstTurnCreatedAt) continue;
    const message = visibleMessages.get(event.dataid);
    if (message) {
      messages.push(message);
      used.add(message.id);
    }
  }

  for (const turn of turns) {
    const input = visibleMessages.get(turn.inputDataId) ?? {
      id: turn.inputDataId,
      role: "user" as const,
      text: visibleUserRequestText(turn.title),
      attachments: []
    };
    messages.push(input);
    used.add(input.id);

    for (const event of visibleEvents) {
      if (event.event !== NDX_TURN_EVENT.AssistantRecorded || used.has(event.dataid)) continue;
      if (event.createdat < turn.createdat || event.createdat > turn.updatedat) continue;
      const message = visibleMessages.get(event.dataid);
      if (!message) continue;
      messages.push(message);
      used.add(message.id);
    }
  }

  for (const event of visibleEvents) {
    const message = visibleMessages.get(event.dataid);
    if (message && !used.has(message.id)) {
      messages.push(message);
      used.add(message.id);
    }
  }
  return messages;
}

export function mergeRestoredChatMessages(current: ChatMessage[], restored: ChatMessage[]): ChatMessage[] {
  if (current.length === 0) {
    return restored;
  }
  const restoredIds = new Set(restored.map((message) => message.id));
  return [
    ...restored,
    ...current.filter((message) => message.id !== "empty" && !restoredIds.has(message.id))
  ];
}

export function turnFlowFromSummary(summary: NDXSessionTurnSummary): TurnFlowState {
  return {
    id: `turn:${summary.sessionid}:${summary.inputDataId}`,
    inputDataId: summary.inputDataId,
    sessionid: summary.sessionid,
    title: summary.title,
    status: summary.status,
    collapsed: true,
    createdAt: summary.createdat,
    updatedAt: summary.updatedat,
    batches: summary.iterations.map((iteration) => emptyBatch(summary, iteration, true))
  };
}

export function mergeRestoredTurnFlows(current: TurnFlowState[], summaries: NDXSessionTurnSummary[]): TurnFlowState[] {
  if (current.length === 0) {
    return summaries.map(turnFlowFromSummary);
  }
  const currentByInput = new Map(current.map((turn) => [turn.inputDataId, turn]));
  const restored = summaries.map((summary) => {
    const next = turnFlowFromSummary(summary);
    const existing = currentByInput.get(next.inputDataId);
    if (!existing) {
      return next;
    }
    const restoredIsNewer = next.updatedAt >= existing.updatedAt;
    return {
      ...existing,
      title: next.title || existing.title,
      status: restoredIsNewer ? mergeTurnStatus(existing.status, next.status) : existing.status,
      createdAt: next.createdAt,
      updatedAt: restoredIsNewer ? next.updatedAt : existing.updatedAt,
      batches: next.batches.length > 0
        ? next.batches.map((batch) => existing.batches.find((item) => item.iteration === batch.iteration) ?? batch)
        : existing.batches
    };
  });
  const restoredInputs = new Set(restored.map((turn) => turn.inputDataId));
  return [
    ...restored,
    ...current.filter((turn) => !restoredInputs.has(turn.inputDataId))
  ];
}

export function mergeTurnSummary(turns: TurnFlowState[], summary: NDXSessionTurnSummary): TurnFlowState[] {
  const existing = turns.find((turn) => turn.inputDataId === summary.inputDataId);
  const nextTurn = existing ? {
    ...existing,
    title: summary.title,
    status: mergeTurnStatus(existing.status, summary.status),
    updatedAt: summary.updatedat,
    batches: summary.iterations.map((iteration) => {
      const current = existing.batches.find((batch) => batch.iteration === iteration.iteration);
      return current ?? emptyBatch(summary, iteration, true);
    })
  } : turnFlowFromSummary(summary);
  return turns.some((turn) => turn.inputDataId === summary.inputDataId)
    ? turns.map((turn) => turn.inputDataId === summary.inputDataId ? nextTurn : turn)
    : [...turns, nextTurn];
}

function mergeTurnStatus(current: TurnFlowState["status"], incoming: TurnFlowState["status"]): TurnFlowState["status"] {
  if (current !== "running" && incoming === "running") {
    return current;
  }
  return incoming;
}

export function applyIterationDetail(turns: TurnFlowState[], detail: NDXSessionIterationDetailResultMessage): TurnFlowState[] {
  return turns.map((turn) => {
    if (turn.inputDataId !== detail.inputDataId) return turn;
    const seed: TurnFlowState = {
      ...turn,
      status: "running",
      collapsed: false,
      batches: turn.batches.length > 0
        ? turn.batches.map((batch) => batch.iteration === detail.iteration ? { ...batch, collapsed: false } : batch)
        : [{
          key: `${turn.id}:iteration:${detail.iteration}`,
          iteration: detail.iteration,
          collapsed: false,
          assistantText: "",
          reasoningText: "",
          modelEvents: [],
          tools: []
        }]
    };
    const reduced = detail.events.reduce(applyTurnEvent, [seed]).at(-1) ?? seed;
    return {
      ...reduced,
      status: turn.status,
      collapsed: false,
      batches: reduced.batches.map((batch) => batch.iteration === detail.iteration ? { ...batch, collapsed: false } : batch)
    };
  });
}

function emptyBatch(summary: NDXSessionTurnSummary, iteration: NDXSessionIterationSummary, collapsed: boolean): TurnBatchState {
  return {
    key: `turn:${summary.sessionid}:${summary.inputDataId}:iteration:${iteration.iteration}`,
    iteration: iteration.iteration,
    collapsed,
    assistantText: "",
    reasoningText: "",
    modelEvents: [],
    tools: []
  };
}
