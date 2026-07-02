import {
  NDX_SESSION_EVENT,
  NDX_SESSION_SIDEBAR_ITEM,
  NDX_TURN_EVENT,
  type NDXLogger
} from "ndx/common";
import type { NDXSessionEventMessage, NDXSessionSidebarItemMessage } from "ndx/common/protocol";
import type { NDXSessionDataRow, NDXSessionRow } from "ndx/agent/session";
import type { NDXTurnLoopEvent } from "ndx/agent/turnloop";
import { sendJson } from "./sendJson.js";
import { SOCKET_TURN_EVENT_FANOUT_SLOW_MS, SOCKET_TURN_EVENT_STREAM_FANOUT_SLOW_MS } from "./monitor.js";
import type { SessionClientState } from "./types.js";

export function sessionSidebarItemSocketMessage(
  session: Pick<NDXSessionRow, "sessionid">,
  event: Extract<NDXTurnLoopEvent, { type: typeof NDX_TURN_EVENT.SidebarItem }>
): NDXSessionSidebarItemMessage {
  return {
    type: NDX_SESSION_SIDEBAR_ITEM,
    sessionid: session.sessionid,
    item: event.item,
    tool: event.tool,
    callId: event.callId,
    createdat: new Date().toISOString()
  };
}

type SessionGrantOwnerTarget = {
  client: SessionClientState;
};

type NDXSessionGrantOwnerMessage = NDXSessionEventMessage | NDXSessionSidebarItemMessage;

type TurnLoopEventSocketContext = {
  session: NDXSessionRow;
  now: string;
  timeKey: number;
  sessionState: NDXSessionEventMessage["sessionState"];
};

type TurnLoopEventSocketSerializerMap = {
  [K in NDXTurnLoopEvent["type"]]: (event: Extract<NDXTurnLoopEvent, { type: K }>, context: TurnLoopEventSocketContext) => NDXSessionGrantOwnerMessage[];
};

const TURN_LOOP_EVENT_SOCKET_SERIALIZERS: TurnLoopEventSocketSerializerMap = {
  [NDX_TURN_EVENT.InputRecorded]: (event, context) => [sessionEventSocketMessage(context.session, event.type, String(event.input.dataid), socketSessionEventContents(event.input.contents), event.input.createdat.toISOString(), event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.ContextReady]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `context-ready:${context.session.sessionid}:${context.timeKey}`, { kind: "context_ready", messageCount: event.messageCount }, context.now, event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.CompactStarted]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `compact-start:${context.session.sessionid}:${context.timeKey}`, { kind: "compact_started", ...event.report }, context.now, event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.CompactCompleted]: (event, context) => [sessionEventSocketMessage(context.session, event.type, String(event.compact.dataid), { kind: "compact_completed", ...event.report, compactDataId: String(event.compact.dataid), sourceRowCount: event.sourceRowCount, summaryTokens: event.summaryTokens, ...compactFallbackReason(event.compact) }, event.compact.createdat.toISOString(), event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.ModelRequest]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `model:${context.session.sessionid}:${event.iteration}`, { kind: "model_request", iteration: event.iteration, messageCount: event.messages.length }, context.now, event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.PrefixDrift]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `prefix-drift:${context.session.sessionid}:${event.iteration}:${context.timeKey}`, { kind: "prefix_drift", iteration: event.iteration, ...event.drift }, context.now, event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.ModelProgress]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `model-progress:${context.session.sessionid}:${event.iteration}:${Math.floor(event.elapsedMs / event.intervalMs)}`, { kind: "model_progress", iteration: event.iteration, elapsedMs: event.elapsedMs, intervalMs: event.intervalMs, message: event.message }, context.now, event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.ModelResume]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `model-resume:${context.session.sessionid}:${event.iteration}`, { kind: "model_request_resuming", iteration: event.iteration, results: event.results.map((result) => ({ tool: result.tool, callId: result.callId, status: result.status, success: result.success })) }, context.now, event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.AssistantDelta]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `stream:${context.session.sessionid}:${event.iteration}`, { kind: "assistant_delta", iteration: event.iteration, delta: event.delta, content: event.content }, context.now, event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.AssistantReasoning]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `reasoning:${context.session.sessionid}:${event.iteration}`, { kind: "assistant_reasoning", iteration: event.iteration, summary: event.summary }, context.now, event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.ToolCallRecorded]: (event, context) => [sessionEventSocketMessage(context.session, event.type, String(event.data.dataid), socketSessionEventContents(event.data.contents), event.data.createdat.toISOString(), event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.ToolBatchStarted]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `tool-batch:${context.session.sessionid}:${event.iteration}`, { kind: "tool_batch", iteration: event.iteration, toolCalls: event.toolCalls }, context.now, event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.ToolProgress]: (event, context) => [toolProgressSocketMessage(event, context)],
  [NDX_TURN_EVENT.SidebarItem]: (event, context) => [sessionSidebarItemSocketMessage(context.session, event)],
  [NDX_TURN_EVENT.SubagentSession]: (event, context) => [sessionEventSocketMessage(context.session, event.type, String(event.data.dataid), socketSessionEventContents(event.data.contents), event.data.createdat.toISOString(), event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.CotWork]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `cot-work:${context.session.sessionid}:${event.iteration}:${event.callId ?? event.tool}:${context.timeKey}`, event.contents, context.now, event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.ToolResultRecorded]: (event, context) => [sessionEventSocketMessage(context.session, event.type, String(event.data.dataid), socketSessionEventContents(event.data.contents), event.data.createdat.toISOString(), event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.Interrupted]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `turn-interrupted:${context.session.sessionid}:${context.timeKey}`, { kind: "turn_interrupted", phase: event.phase }, context.now, event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.InterruptCompleted]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `interrupt-completed:${context.session.sessionid}:${context.timeKey}`, { kind: "interrupt_completed", phase: event.phase, session: toSocketSession(event.session) }, context.now, event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.AssistantRecorded]: (event, context) => [sessionEventSocketMessage(context.session, event.type, String(event.assistant.dataid), socketSessionEventContents(event.assistant.contents), event.assistant.createdat.toISOString(), event.contextUsage, context.sessionState)],
  [NDX_TURN_EVENT.TurnEnd]: (event, context) => [sessionEventSocketMessage(context.session, event.type, `turn-end:${context.session.sessionid}:${event.iteration}:${context.timeKey}`, { kind: "turn_end", iteration: event.iteration, session: toSocketSession(event.session) }, context.now, event.contextUsage, context.sessionState)]
};

export async function sendTurnLoopEventToSessionGrantOwners(
  connectedClients: Map<string, SessionClientState>,
  session: NDXSessionRow,
  event: NDXTurnLoopEvent,
  logger?: NDXLogger
) {
  const startedAt = Date.now();
  const targets = sessionGrantOwnerTargets(connectedClients, session.sessionid);
  const deliveries = targets.flatMap((target) => {
    const context: TurnLoopEventSocketContext = {
      session,
      now: new Date().toISOString(),
      timeKey: Date.now(),
      sessionState: event.type === NDX_TURN_EVENT.TurnEnd || event.type === NDX_TURN_EVENT.InterruptCompleted
        ? { isrunning: event.session.isrunning, session: toSocketSession(event.session) }
        : { isrunning: true, session: toSocketSession(session) }
    };
    return sessionSocketMessagesFromTurnLoopEvent(event, context).map((message) => ({ target, message }));
  });
  await Promise.all(deliveries.map(({ target, message }) => sendJson(target.client, message, {
      logger,
      sessionid: session.sessionid,
      event: event.type,
      targetCount: targets.length
    })));
  const durationMs = Date.now() - startedAt;
  const thresholdMs = event.type === NDX_TURN_EVENT.AssistantDelta || event.type === NDX_TURN_EVENT.AssistantReasoning
    ? SOCKET_TURN_EVENT_STREAM_FANOUT_SLOW_MS
    : SOCKET_TURN_EVENT_FANOUT_SLOW_MS;
  const payload = { sessionid: session.sessionid, event: event.type, targetCount: targets.length, messageCount: deliveries.length, durationMs, thresholdMs };
  if (durationMs > thresholdMs) {
    logger?.warn("agent.socket.turn_event.fanout.slow", payload);
  } else {
    logger?.debug("agent.socket.turn_event.fanout.complete", payload);
  }
}

export function sessionSocketMessagesFromTurnLoopEvent(event: NDXTurnLoopEvent, context: TurnLoopEventSocketContext): NDXSessionGrantOwnerMessage[] {
  const serialize = TURN_LOOP_EVENT_SOCKET_SERIALIZERS[event.type] as (event: NDXTurnLoopEvent, context: TurnLoopEventSocketContext) => NDXSessionGrantOwnerMessage[];
  return serialize(event, context);
}

export function sessionGrantOwnerTargets(connectedClients: Map<string, SessionClientState>, sessionid: string): SessionGrantOwnerTarget[] {
  const targets: SessionGrantOwnerTarget[] = [];
  for (const client of connectedClients.values()) {
    if (client.grants.has(sessionid)) {
      targets.push({ client });
    }
  }
  return targets;
}

export function sessionEventSocketMessage(
  session: Pick<NDXSessionRow, "sessionid">,
  event: NDXSessionEventMessage["event"],
  dataid: string,
  contents: NDXSessionEventMessage["contents"],
  createdat: string,
  contextUsage: NDXSessionEventMessage["contextUsage"],
  sessionState: NDXSessionEventMessage["sessionState"]
): NDXSessionEventMessage {
  return {
    type: NDX_SESSION_EVENT,
    sessionid: session.sessionid,
    event,
    dataid,
    contents,
    createdat,
    contextUsage,
    sessionState
  };
}

export function socketSessionEventContents(contents: unknown): NDXSessionEventMessage["contents"] {
  if (typeof contents === "string") return contents;
  if (contents && typeof contents === "object" && !Array.isArray(contents)) {
    return contents as NDXSessionEventMessage["contents"];
  }
  return String(contents ?? "");
}

function toolProgressSocketMessage(
  event: Extract<NDXTurnLoopEvent, { type: typeof NDX_TURN_EVENT.ToolProgress }>,
  context: TurnLoopEventSocketContext
): NDXSessionEventMessage {
  if (event.status === "started") {
    return sessionEventSocketMessage(context.session, event.type, `tool-start:${context.session.sessionid}:${event.iteration}:${event.callId ?? event.tool}`, { kind: "tool_started", iteration: event.iteration, tool: event.tool, callId: event.callId, args: event.args, startedAt: event.startedAt, status: event.status }, context.now, event.contextUsage, context.sessionState);
  }
  if (event.status === "progress") {
    return sessionEventSocketMessage(context.session, event.type, `tool-progress:${context.session.sessionid}:${event.iteration}:${event.callId ?? event.tool}:${context.timeKey}`, { kind: "tool_progress", iteration: event.iteration, tool: event.tool, callId: event.callId, event: event.event, receivedAt: event.receivedAt, status: event.status }, context.now, event.contextUsage, context.sessionState);
  }
  if (event.status === "finished") {
    return sessionEventSocketMessage(context.session, event.type, `tool-finish:${context.session.sessionid}:${event.iteration}:${event.result.callId ?? event.result.tool}`, { kind: "tool_finished", iteration: event.iteration, result: event.result, status: event.status }, context.now, event.contextUsage, context.sessionState);
  }
  return sessionEventSocketMessage(context.session, event.type, `tool-interrupt:${context.session.sessionid}:${event.iteration}:${event.callId ?? event.tool}:${context.timeKey}`, {
    kind: "tool_interrupt",
    iteration: event.iteration,
    tool: event.tool,
    callId: event.callId,
    phase: event.phase,
    status: event.status,
    signal: event.signal,
    receivedAt: event.receivedAt
  }, context.now, event.contextUsage, context.sessionState);
}

export function compactFallbackReason(compact: NDXSessionDataRow | undefined): { fallbackReason?: string } {
  if (!compact?.contents || typeof compact.contents !== "object") {
    return {};
  }
  const fallbackReason = (compact.contents as { fallbackReason?: unknown }).fallbackReason;
  return typeof fallbackReason === "string" && fallbackReason.trim() ? { fallbackReason } : {};
}

export function toSocketSession(session: NDXSessionRow) {
  return {
    ...session,
    lastupdated: session.lastupdated.toISOString(),
    interruptrequestedat: session.interruptrequestedat?.toISOString() ?? null,
    interruptcompletedat: session.interruptcompletedat?.toISOString() ?? null
  };
}
