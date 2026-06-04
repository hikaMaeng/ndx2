import type {
  NDXSessionHistorySummaryResultMessage,
  NDXSessionIterationDetailResultMessage,
  NDXSessionTurnDetailResultMessage
} from "ndx/common/protocol";
import {
  applyIterationDetail,
  chatMessageFromSessionEvent,
  mergeRestoredChatMessages,
  mergeRestoredTurnFlows,
  mergeTurnSummary
} from "../history.js";
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
      messages: mergeRestoredChatMessages(model.history.messages, message.visibleEvents.flatMap((event) => {
        const chatMessage = chatMessageFromSessionEvent(event);
        return chatMessage ? [chatMessage] : [];
      })),
      turns: mergeRestoredTurnFlows(model.history.turns, message.turns)
    },
    runtime: {
      ...model.runtime,
      cotWork: undefined,
      contextUsage: message.contextUsage ? { ...message.contextUsage, parts: message.contextUsage.parts ?? model.runtime.contextUsage?.parts } : model.runtime.contextUsage
    }
  };
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
