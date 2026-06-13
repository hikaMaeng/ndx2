import { NDX_SESSION_EVENT, NDX_TURN_EVENT, type NDXSessionEventMessage, type NDXSessionIterationSummary, type NDXSessionTurnSummary } from "ndx/common";
import {
  buildTurnMessageParts,
  calculateDetailedContextUsage,
  listAvailableTools,
  listSessionData,
  toolSchemas,
  type NDXDatabase,
  type NDXSessionDataRow,
  type NDXSessionRow
} from "ndx/agent";
import { serverContainerUserHome, toServerProjectPath } from "ndx/common/server-path";
import { sessionDataToSessionEvent, type NDXAgentWebSessionData } from "ndx/webclient/common";

type SessionHistoryTurn = {
  summary: NDXSessionTurnSummary;
  events: NDXSessionEventMessage[];
  finalEvent?: NDXSessionEventMessage;
  inputEvent: NDXSessionEventMessage;
};

export async function buildSessionHistorySummary(database: NDXDatabase, session: NDXSessionRow) {
  const turns = await listSessionHistoryTurns(database, session.sessionid);
  const leadingCompactEvents = await listLeadingCompactEvents(database, session);
  const parts = await buildTurnMessageParts(database, session);
  const tools = toolSchemas(await listAvailableTools({ userHome: serverContainerUserHome(), projectHome: toServerProjectPath(session.path) }));
  return {
    visibleEvents: [...leadingCompactEvents, ...turns.flatMap((turn) => turn.finalEvent ? [turn.inputEvent, turn.finalEvent] : [turn.inputEvent])],
    turns: turns.map((turn) => ({ ...turn.summary, iterations: [] })),
    contextUsage: calculateDetailedContextUsage(
      [parts.developer, parts.user, ...parts.history].filter((message) => {
        if (!("content" in message)) return true;
        return typeof message.content === "string" ? message.content.trim().length > 0 : Array.isArray(message.content) ? message.content.length > 0 : true;
      }),
      session.model.contextsize,
      "",
      tools
    )
  };
}

async function listLeadingCompactEvents(database: NDXDatabase, session: NDXSessionRow): Promise<NDXSessionEventMessage[]> {
  const rows = await listSessionData(database, session.sessionid);
  const events: NDXSessionEventMessage[] = [];
  for (const row of rows) {
    if (row.type === "user") {
      break;
    }
    const event = rowToSessionEvent(row);
    if (event?.event === NDX_TURN_EVENT.CompactCompleted && event.contents && typeof event.contents === "object" && (event.contents as { kind?: unknown }).kind === "compact") {
      const sourceInputEvent = branchSourceInputEvent(session, row);
      if (sourceInputEvent) {
        events.push(sourceInputEvent);
      }
      events.push(event);
    }
  }
  return events;
}

function branchSourceInputEvent(session: NDXSessionRow, compactRow: NDXSessionDataRow): NDXSessionEventMessage | undefined {
  if (!compactRow.contents || typeof compactRow.contents !== "object") return undefined;
  const compact = compactRow.contents as { createdReason?: unknown; sourceInput?: unknown };
  if (compact.createdReason !== "branch") return undefined;
  let text: string | undefined;
  let sourceDataId = String(compactRow.dataid);
  if (compact.sourceInput && typeof compact.sourceInput === "object") {
    const sourceInput = compact.sourceInput as { dataId?: unknown; text?: unknown };
    if (typeof sourceInput.text === "string" && sourceInput.text.trim()) {
      text = sourceInput.text;
    }
    if (typeof sourceInput.dataId === "string" && sourceInput.dataId.trim()) {
      sourceDataId = sourceInput.dataId;
    }
  }
  if (!text) {
    text = session.title.startsWith("🚩") ? session.title.slice("🚩".length).trim() : undefined;
  }
  if (!text) return undefined;
  return {
    type: NDX_SESSION_EVENT,
    sessionid: session.sessionid,
    event: NDX_TURN_EVENT.InputRecorded,
    dataid: `branch-source:${compactRow.dataid}:${sourceDataId}`,
    contents: { kind: "user_message", text },
    createdat: compactRow.createdat.toISOString()
  };
}

export async function buildSessionTurnDetail(database: NDXDatabase, sessionid: string, inputDataId: string) {
  const turn = (await listSessionHistoryTurns(database, sessionid)).find((item) => item.summary.inputDataId === inputDataId);
  return turn?.summary;
}

export async function buildSessionIterationDetail(database: NDXDatabase, sessionid: string, inputDataId: string, iteration: number) {
  const turn = (await listSessionHistoryTurns(database, sessionid)).find((item) => item.summary.inputDataId === inputDataId);
  if (!turn) return [];
  return turn.events.filter((event) => eventIteration(event) === iteration && event.event !== NDX_TURN_EVENT.InputRecorded && event.event !== NDX_TURN_EVENT.AssistantRecorded);
}

async function listSessionHistoryTurns(database: NDXDatabase, sessionid: string): Promise<SessionHistoryTurn[]> {
  const rows = await listSessionData(database, sessionid);
  const turns: SessionHistoryTurn[] = [];
  let current: { inputEvent: NDXSessionEventMessage; events: NDXSessionEventMessage[] } | undefined;

  for (const row of rows) {
    const event = rowToSessionEvent(row);
    if (!event) continue;
    if (event.event === NDX_TURN_EVENT.InputRecorded) {
      if (current) {
        turns.push(toHistoryTurn(current.inputEvent, current.events));
      }
      current = { inputEvent: event, events: [event] };
      continue;
    }
    if (!current) continue;
    current.events.push(event);
    if (event.event === NDX_TURN_EVENT.AssistantRecorded) {
      turns.push(toHistoryTurn(current.inputEvent, current.events));
      current = undefined;
    }
  }
  if (current) {
    turns.push(toHistoryTurn(current.inputEvent, current.events));
  }
  return turns;
}

function rowToSessionEvent(row: NDXSessionDataRow): NDXSessionEventMessage | undefined {
  return sessionDataToSessionEvent({
    dataid: String(row.dataid),
    sessionid: row.sessionid,
    type: row.type,
    contents: row.contents,
    createdat: row.createdat.toISOString()
  } satisfies NDXAgentWebSessionData);
}

function toHistoryTurn(inputEvent: NDXSessionEventMessage, events: NDXSessionEventMessage[]): SessionHistoryTurn {
  const finalEvent = [...events].reverse().find((event) => event.event === NDX_TURN_EVENT.AssistantRecorded);
  const interrupted = events.some((event) => event.event === NDX_TURN_EVENT.Interrupted || event.event === NDX_TURN_EVENT.InterruptCompleted);
  const iterationMap = new Map<number, NDXSessionIterationSummary>();
  for (const event of events) {
    const iteration = eventIteration(event);
    if (!iteration || event.event === NDX_TURN_EVENT.InputRecorded || event.event === NDX_TURN_EVENT.AssistantRecorded) continue;
    const current = iterationMap.get(iteration) ?? { iteration, eventCount: 0, hasAssistantText: false, hasTools: false };
    iterationMap.set(iteration, {
      ...current,
      eventCount: current.eventCount + 1,
      hasAssistantText: current.hasAssistantText || event.event === NDX_TURN_EVENT.AssistantDelta || event.event === NDX_TURN_EVENT.AssistantReasoning,
      hasTools: current.hasTools || event.event === NDX_TURN_EVENT.ToolCallRecorded || event.event === NDX_TURN_EVENT.ToolBatchStarted || event.event === NDX_TURN_EVENT.ToolProgress || event.event === NDX_TURN_EVENT.ToolResultRecorded
    });
  }
  return {
    inputEvent,
    finalEvent,
    events,
    summary: {
      inputDataId: inputEvent.dataid,
      sessionid: inputEvent.sessionid,
      title: eventText(inputEvent.contents) || "Turn",
      status: interrupted ? "interrupted" : finalEvent ? "completed" : "running",
      createdat: inputEvent.createdat,
      updatedat: events.at(-1)?.createdat ?? inputEvent.createdat,
      iterations: [...iterationMap.values()].sort((left, right) => left.iteration - right.iteration)
    }
  };
}

function eventIteration(event: NDXSessionEventMessage): number {
  if (event.contents && typeof event.contents === "object" && typeof (event.contents as { iteration?: unknown }).iteration === "number") {
    return (event.contents as { iteration: number }).iteration;
  }
  return 0;
}

function eventText(contents: unknown): string | undefined {
  if (typeof contents === "string") return contents;
  if (!contents || typeof contents !== "object") return undefined;
  const payload = contents as { text?: unknown; message?: unknown };
  return typeof payload.text === "string" ? payload.text : typeof payload.message === "string" ? payload.message : undefined;
}
