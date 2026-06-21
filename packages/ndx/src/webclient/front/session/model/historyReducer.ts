import type {
  NDXSessionHistorySummaryResultMessage,
  NDXSessionIterationDetailResultMessage,
  NDXSessionEventMessage,
  NDXSessionTurnDetailResultMessage
} from "ndx/common/protocol";
import { NDX_TURN_EVENT } from "ndx/common/protocol";
import {
  applyIterationDetail,
  chatMessagesFromHistorySummary,
  mergeRestoredChatMessages,
  mergeRestoredTurnFlows,
  mergeTurnSummary
} from "../history.js";
import type { SubsessionBarState } from "../uiState.js";
import type { SessionInstanceModel } from "./types.js";

export function applySessionHistorySummary(model: SessionInstanceModel, message: NDXSessionHistorySummaryResultMessage): SessionInstanceModel {
  return {
    ...model,
    connection: {
      ...model.connection,
      historyLoaded: true
    },
    history: {
      ...model.history,
      messages: mergeRestoredChatMessages(model.history.messages, chatMessagesFromHistorySummary(message.visibleEvents, message.turns)),
      turns: mergeRestoredTurnFlows(model.history.turns, message.turns)
    },
    subsessions: mergeRestoredSubsessions(model.subsessions, subagentBarsFromHistoryEvents(message.visibleEvents)),
    runtime: {
      ...model.runtime,
      cotWork: message.activeCotWork,
      contextUsage: message.contextUsage ? { ...message.contextUsage, parts: message.contextUsage.parts ?? model.runtime.contextUsage?.parts } : model.runtime.contextUsage
    }
  };
}

function subagentBarsFromHistoryEvents(events: NDXSessionEventMessage[]): SubsessionBarState[] {
  return events.flatMap((event) => {
    if (event.event !== NDX_TURN_EVENT.SubagentSession || !event.contents || typeof event.contents !== "object" || (event.contents as { kind?: unknown }).kind !== "subagent_session") {
      return [];
    }
    const contents = event.contents as {
      sessionid?: unknown;
      parentSessionid?: unknown;
      subagentType?: unknown;
      toolCallId?: unknown;
      modeltype?: unknown;
      assignedModelKey?: unknown;
      parentcontext?: unknown;
      status?: unknown;
      title?: unknown;
    };
    if (typeof contents.sessionid !== "string" || typeof contents.parentSessionid !== "string" || typeof contents.subagentType !== "string") {
      return [];
    }
    return [{
      id: contents.sessionid,
      sessionid: contents.sessionid,
      parentSessionid: contents.parentSessionid,
      subagentType: contents.subagentType,
      ...(typeof contents.toolCallId === "string" ? { toolCallId: contents.toolCallId } : {}),
      ...(typeof contents.modeltype === "string" ? { modeltype: contents.modeltype } : {}),
      ...(typeof contents.assignedModelKey === "string" ? { assignedModelKey: contents.assignedModelKey } : {}),
      ...(typeof contents.parentcontext === "boolean" ? { parentcontext: contents.parentcontext } : {}),
      status: contents.status === "completed" || contents.status === "failed" || contents.status === "interrupted" || contents.status === "created" || contents.status === "running" ? contents.status : "running",
      ...(typeof contents.title === "string" ? { title: contents.title } : {}),
      expanded: false
    }];
  });
}

function mergeRestoredSubsessions(current: SubsessionBarState[], restored: SubsessionBarState[]): SubsessionBarState[] {
  if (restored.length === 0) return current;
  const currentBySession = new Map(current.map((item) => [item.sessionid, item]));
  const merged = restored.map((item) => {
    const existing = currentBySession.get(item.sessionid);
    return existing ? { ...item, expanded: existing.expanded } : item;
  });
  const restoredIds = new Set(restored.map((item) => item.sessionid));
  return [...merged, ...current.filter((item) => !restoredIds.has(item.sessionid))];
}

export function applySessionTurnDetail(model: SessionInstanceModel, message: NDXSessionTurnDetailResultMessage): SessionInstanceModel {
  if (!message.turn) return model;
  return {
    ...model,
    history: {
      ...model.history,
      turns: mergeTurnSummary(model.history.turns, message.turn)
    }
  };
}

export function applySessionIterationDetail(model: SessionInstanceModel, message: NDXSessionIterationDetailResultMessage): SessionInstanceModel {
  return {
    ...model,
    history: {
      ...model.history,
      turns: applyIterationDetail(model.history.turns, message)
    }
  };
}
