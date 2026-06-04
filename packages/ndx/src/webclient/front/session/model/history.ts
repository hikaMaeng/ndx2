import type { ChatMessage } from "../chat.js";
import type { TurnFlowState } from "../turn/index.js";

export type SessionHistoryModel = {
  messages: ChatMessage[];
  turns: TurnFlowState[];
  requestedTurnDetails: Record<string, true>;
  requestedIterationDetails: Record<string, true>;
};

export function createSessionHistoryModel(): SessionHistoryModel {
  return {
    messages: [],
    turns: [],
    requestedTurnDetails: {},
    requestedIterationDetails: {}
  };
}
