import {
  NDX_TURN_EVENT,
  formatNDXCotWorkElapsed,
  isNDXCotWorkContents,
  type NDXCotWorkContents,
  type NDXSidebarItem,
  type NDXSessionEventMessage,
  type NDXTurnEventName
} from "ndx/common/protocol";
import { sessionDataContentsText, sessionDataToChatMessage, withoutPendingUserChatMessages } from "./chat.js";
import { interruptWasAccepted } from "./event.js";
import { upsertRightSidebarItem } from "./rightSidebar.js";
import { applyTurnEvent } from "./turn/index.js";
import type { NDXAgentWebContextUsage } from "./chat.js";
import type { SessionUiState, SubsessionBarState } from "./uiState.js";

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
  [NDX_TURN_EVENT.InputRecorded]: turnStartedEvent,
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
  [NDX_TURN_EVENT.SubagentSession]: subagentSessionEvent,
  [NDX_TURN_EVENT.CotWork]: cotWorkEvent,
  [NDX_TURN_EVENT.ToolResultsCollected]: runningEvent,
  [NDX_TURN_EVENT.ToolResultRecorded]: runningEvent,
  [NDX_TURN_EVENT.TurnEnd]: turnEndEvent,
  [NDX_TURN_EVENT.Interrupted]: interruptedEvent,
  [NDX_TURN_EVENT.InterruptCompleted]: interruptCompletedEvent,
  [NDX_TURN_EVENT.Failed]: failedEvent,
  [NDX_TURN_EVENT.HookComplete]: hookDiagnosticEvent,
  [NDX_TURN_EVENT.HookFailed]: hookDiagnosticEvent
} satisfies Record<NDXTurnEventName, ProtocolEventUiReducer>;

export function applyProtocolEventToSessionUiState(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  const next = PROTOCOL_EVENT_UI_REDUCERS[message.event](current, message, text);
  return typeof message.sessionState?.isrunning === "boolean"
    ? { ...next, agentRunning: message.sessionState.isrunning }
    : next;
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

function turnStartedEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  const next = rowMessageEvent(current, message, text);
  return {
    ...next,
    cotWork: undefined,
    rightSidebarItems: next.rightSidebarItems.filter((item) => !(item.group.id === "plans" && item.kind === "cot_work"))
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
  const next = withContextAndTurn(current, message);
  if (message.event !== NDX_TURN_EVENT.AssistantDelta) {
    return {
      ...next,
      agentRunning: true,
      notice: text.operationInProgress
    };
  }
  const streamedText = sessionDataContentsText(message.contents);
  if (!streamedText?.trim()) {
    return {
      ...next,
      agentRunning: true,
      notice: text.operationInProgress
    };
  }
  const streamMessage = { id: `stream:${message.sessionid}`, role: "assistant" as const, text: streamedText, attachments: [] };
  return {
    ...next,
    agentRunning: true,
    notice: text.operationInProgress,
    chatMessages: [
      ...current.chatMessages.filter((item) => item.id !== "empty" && item.id !== streamMessage.id),
      streamMessage
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
    rightSidebarItems: cotWorkSidebarItems(message.contents).reduce(
      upsertRightSidebarItem,
      current.rightSidebarItems.filter((item) => !(item.group.id === "plans" && item.kind === "cot_work"))
    ),
    agentRunning: true,
    notice: text.operationInProgress
  };
}

function cotWorkSidebarItems(contents: NDXCotWorkContents): NDXSidebarItem[] {
  return contents.steps.flatMap((step, index) => {
    if (step.status !== "completed") {
      return [];
    }
    const elapsed = step.elapsed ?? (typeof step.elapsedMs === "number" ? formatNDXCotWorkElapsed(step.elapsedMs) : undefined);
    return [{
      group: { id: "plans", title: "작업 계획" },
      key: `cot-work-step:${index}:${step.task}`,
      title: step.task,
      ...(elapsed ? { body: elapsed } : {}),
      kind: "cot_work"
    }];
  });
}

function subagentSessionEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  if (!message.contents || typeof message.contents !== "object" || (message.contents as { kind?: unknown }).kind !== "subagent_session") {
    return runningEvent(current, message, text);
  }
  const contents = message.contents as {
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
    return runningEvent(current, message, text);
  }
  const status: SubsessionBarState["status"] = contents.status === "completed" || contents.status === "failed" || contents.status === "interrupted" || contents.status === "created" || contents.status === "running" ? contents.status : "running";
  const next: SubsessionBarState = {
    id: contents.sessionid,
    sessionid: contents.sessionid,
    parentSessionid: contents.parentSessionid,
    subagentType: contents.subagentType,
    ...(typeof contents.toolCallId === "string" ? { toolCallId: contents.toolCallId } : {}),
    ...(typeof contents.modeltype === "string" ? { modeltype: contents.modeltype } : {}),
    ...(typeof contents.assignedModelKey === "string" ? { assignedModelKey: contents.assignedModelKey } : {}),
    ...(typeof contents.parentcontext === "boolean" ? { parentcontext: contents.parentcontext } : {}),
    status,
    ...(typeof contents.title === "string" ? { title: contents.title } : {}),
    expanded: current.subsessions.find((item) => item.sessionid === contents.sessionid)?.expanded ?? false
  };
  return {
    ...withContextAndTurn(current, message),
    subsessions: [
      ...current.subsessions.filter((item) => item.sessionid !== contents.sessionid),
      next
    ],
    agentRunning: status === "running" ? true : current.agentRunning,
    notice: status === "running" ? text.operationInProgress : current.notice
  };
}

function rowMessageEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  const rowType = message.event === NDX_TURN_EVENT.AssistantRecorded ? "assistant" : "user";
  const nextMessage = sessionDataToChatMessage({ dataid: message.dataid, sessionid: message.sessionid, type: rowType, contents: message.contents, createdat: message.createdat });
  const currentMessages = message.event === NDX_TURN_EVENT.InputRecorded || message.event === NDX_TURN_EVENT.AssistantRecorded ? withoutPendingUserChatMessages(current.chatMessages) : current.chatMessages;
  const nextMessages = currentMessages.filter((item) => item.id !== "empty" && item.id !== nextMessage.id && (message.event !== NDX_TURN_EVENT.AssistantRecorded || item.id !== `stream:${message.sessionid}`));
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
    ...current,
    reportedContextUsage: contextUsageForUi(current, message.contextUsage),
    agentRunning: false,
    compactRunning: false,
    notice: text.requestStored,
    chatMessages: withoutPendingUserChatMessages(current.chatMessages)
  };
}

function hookDiagnosticEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  return {
    ...withContextAndTurn(current, message),
    notice: current.agentRunning ? text.operationInProgress : current.notice
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
    notice: text.interruptStored,
    chatMessages: withoutPendingUserChatMessages(current.chatMessages)
  };
}

function interruptCompletedEvent(current: SessionUiState, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionUiState {
  return {
    ...withContextAndTurn(current, message),
    cotWork: undefined,
    agentRunning: false,
    compactRunning: false,
    notice: text.interruptStored,
    chatMessages: withoutPendingUserChatMessages(current.chatMessages)
  };
}

function failedEvent(current: SessionUiState, message: NDXSessionEventMessage): SessionUiState {
  const messageText = sessionDataContentsText(message.contents) ?? "Session request failed.";
  return {
    ...withContextAndTurn(current, message),
    agentRunning: false,
    compactRunning: false,
    notice: messageText,
    sessionError: messageText,
    chatMessages: withoutPendingUserChatMessages(current.chatMessages)
  };
}
