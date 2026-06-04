import {
  NDX_TURN_EVENT,
  isNDXCotWorkContents,
  type NDXSessionEventMessage,
  type NDXTurnEventName
} from "ndx/common/protocol";
import { sessionDataContentsText, sessionDataToChatMessage } from "./chat.js";
import { interruptWasAccepted } from "./event.js";
import { applyTurnEvent } from "./turn/index.js";
import type { NDXAgentWebContextUsage } from "./chat.js";
import type { SessionUiState } from "./uiState.js";

export type ProtocolEventUiText = {
  compactCompleted: string;
  compactStarted: string;
  interruptPending: string;
  interruptStored: string;
  operationInProgress: string;
  prefixDrift: string;
  requestStored: string;
};

type ProtocolEventUiReducer = (current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText) => SessionUiState;

export const PROTOCOL_EVENT_UI_REDUCERS = {
  [NDX_TURN_EVENT.InputRecorded]: rowMessageEvent,
  [NDX_TURN_EVENT.ContextReady]: runningEvent,
  [NDX_TURN_EVENT.CompactStarted]: compactStartedEvent,
  [NDX_TURN_EVENT.CompactCompleted]: compactCompletedEvent,
  [NDX_TURN_EVENT.RequestReceived]: runningEvent,
  [NDX_TURN_EVENT.ContextPrepared]: runningEvent,
  [NDX_TURN_EVENT.ModelRequest]: runningEvent,
  [NDX_TURN_EVENT.PrefixDrift]: prefixDriftEvent,
  [NDX_TURN_EVENT.ModelProgress]: modelProgressEvent,
  [NDX_TURN_EVENT.ModelResponse]: runningEvent,
  [NDX_TURN_EVENT.ModelResponding]: runningEvent,
  [NDX_TURN_EVENT.ModelResume]: runningEvent,
  [NDX_TURN_EVENT.AssistantDelta]: assistantStreamEvent,
  [NDX_TURN_EVENT.AssistantReasoning]: assistantStreamEvent,
  [NDX_TURN_EVENT.AssistantRecorded]: rowMessageEvent,
  [NDX_TURN_EVENT.ToolCalled]: runningEvent,
  [NDX_TURN_EVENT.ToolCallRecorded]: runningEvent,
  [NDX_TURN_EVENT.ToolBatchStarted]: runningEvent,
  [NDX_TURN_EVENT.ToolProgress]: runningEvent,
  [NDX_TURN_EVENT.SidebarItem]: runningEvent,
  [NDX_TURN_EVENT.CotWork]: cotWorkEvent,
  [NDX_TURN_EVENT.ToolResultsCollected]: runningEvent,
  [NDX_TURN_EVENT.ToolResultRecorded]: runningEvent,
  [NDX_TURN_EVENT.TurnEnd]: turnEndEvent,
  [NDX_TURN_EVENT.Interrupted]: interruptedEvent,
  [NDX_TURN_EVENT.InterruptCompleted]: interruptCompletedEvent,
  [NDX_TURN_EVENT.Failed]: failedEvent,
  [NDX_TURN_EVENT.HookComplete]: runningEvent,
  [NDX_TURN_EVENT.HookFailed]: runningEvent
} satisfies Record<NDXTurnEventName, ProtocolEventUiReducer>;

export function applyProtocolEventToSessionUiState(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  return PROTOCOL_EVENT_UI_REDUCERS[message.event](current, message, text);
}

function contextUsageForUi(current: SessionUiState, usage?: NDXAgentWebContextUsage) {
  return usage ? { ...usage, parts: usage.parts ?? current.reportedContextUsage?.parts } : current.reportedContextUsage;
}

function withContextAndTurn(current: SessionUiState, message: NDXSessionEventMessage): SessionUiState {
  return {
    ...current,
    reportedContextUsage: contextUsageForUi(current, message.contextUsage),
    turnFlows: applyTurnEvent(current.turnFlows, message)
  };
}

function runningEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  return {
    ...withContextAndTurn(current, message),
    agentRunning: true,
    notice: text.operationInProgress
  };
}

function compactStartedEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  return {
    ...withContextAndTurn(current, message),
    compactRunning: true,
    agentRunning: true,
    notice: sessionDataContentsText(message.contents) ?? text.compactStarted
  };
}

function compactCompletedEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  return {
    ...withContextAndTurn(current, message),
    compactRunning: false,
    agentRunning: true,
    notice: sessionDataContentsText(message.contents) ?? text.compactCompleted
  };
}

function prefixDriftEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  return {
    ...withContextAndTurn(current, message),
    agentRunning: true,
    notice: sessionDataContentsText(message.contents) ?? text.prefixDrift
  };
}

function modelProgressEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  return {
    ...withContextAndTurn(current, message),
    agentRunning: true,
    notice: sessionDataContentsText(message.contents) ?? text.operationInProgress
  };
}

function assistantStreamEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  const streamId = `stream:${message.sessionid}`;
  return {
    ...withContextAndTurn(current, message),
    agentRunning: true,
    notice: text.operationInProgress,
    chatMessages: [
      ...current.chatMessages.filter((item) => item.id !== "empty" && item.id !== streamId),
      { id: streamId, role: "assistant", text: sessionDataContentsText(message.contents) ?? JSON.stringify(message.contents), attachments: [] }
    ]
  };
}

function cotWorkEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  if (!isNDXCotWorkContents(message.contents)) {
    return runningEvent(current, message, text);
  }
  return {
    ...withContextAndTurn(current, message),
    cotWork: message.contents,
    agentRunning: true,
    notice: text.operationInProgress
  };
}

function rowMessageEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  const rowType = message.event === NDX_TURN_EVENT.AssistantRecorded ? "assistant" : "user";
  const nextMessage = sessionDataToChatMessage({ dataid: message.dataid, sessionid: message.sessionid, type: rowType, contents: message.contents, createdat: message.createdat });
  const nextMessages = current.chatMessages.filter((item) => item.id !== "empty" && item.id !== nextMessage.id && (message.event !== NDX_TURN_EVENT.AssistantRecorded || item.id !== `stream:${message.sessionid}`));
  return {
    ...withContextAndTurn(current, message),
    agentRunning: message.event === NDX_TURN_EVENT.InputRecorded,
    compactRunning: message.event === NDX_TURN_EVENT.AssistantRecorded ? false : current.compactRunning,
    notice: message.event === NDX_TURN_EVENT.AssistantRecorded ? text.requestStored : current.notice,
    chatMessages: [...nextMessages, nextMessage]
  };
}

function turnEndEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  return {
    ...withContextAndTurn(current, message),
    agentRunning: false,
    compactRunning: false,
    notice: text.requestStored
  };
}

function interruptedEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  if (interruptWasAccepted(message.contents)) {
    return {
      ...withContextAndTurn(current, message),
      cotWork: undefined,
      agentRunning: true,
      notice: text.interruptPending
    };
  }
  return {
    ...current,
    reportedContextUsage: contextUsageForUi(current, message.contextUsage),
    cotWork: undefined,
    agentRunning: false,
    compactRunning: false,
    notice: text.interruptStored
  };
}

function interruptCompletedEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  return {
    ...withContextAndTurn(current, message),
    cotWork: undefined,
    agentRunning: false,
    compactRunning: false,
    notice: text.interruptStored
  };
}

function failedEvent(current: SessionUiState, message: NDXSessionEventMessage): SessionUiState {
  const messageText = sessionDataContentsText(message.contents) ?? "Session request failed.";
  return {
    ...withContextAndTurn(current, message),
    agentRunning: false,
    compactRunning: false,
    notice: messageText,
    sessionError: messageText
  };
}
