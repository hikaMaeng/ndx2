import {
  NDX_ACCOUNT_SELECTED,
  NDX_ACCOUNT_SELECTION_REQUIRED,
  type NDXAccountSelectedMessage,
  type NDXAccountSelectionRequiredMessage,
  type NDXAccountSelectMessage
} from "./identity/index.js";
import {
  NDX_PROJECT_NEGOTIATED,
  NDX_PROJECT_NEGOTIATION_REQUIRED,
  type NDXProjectConfigureMessage,
  type NDXProjectNegotiatedMessage,
  type NDXProjectNegotiationRequiredMessage
} from "./project/index.js";
import { NDX_PROTOCOL_ERROR, type NDXProtocolErrorMessage } from "./error/index.js";
import {
  NDX_SESSION_ATTACHED,
  NDX_SESSION_BRANCH_CREATED,
  NDX_SESSION_CLIENT_REQUEST,
  NDX_SESSION_CLIENT_REQUEST_CLOSED,
  NDX_SESSION_CREATED,
  NDX_SESSION_DELETED,
  NDX_SESSION_EVENT,
  NDX_SESSION_HISTORY_SUMMARY_RESULT,
  NDX_SESSION_ITERATION_DETAIL_RESULT,
  NDX_SESSION_LIST_CHANGED,
  NDX_SESSION_READY,
  NDX_SESSION_RENAMED,
  NDX_SESSION_SIDEBAR_ITEM,
  NDX_SESSION_SKILL_LIST_RESULT,
  NDX_SESSION_TURN_DETAIL_RESULT,
  NDX_SESSION_TURN_DELETED,
  type NDXSessionAttachMessage,
  type NDXSessionAttachedMessage,
  type NDXSessionBranchCreateMessage,
  type NDXSessionBranchCreatedMessage,
  type NDXSessionClientRequestClosedMessage,
  type NDXSessionClientRequestMessage,
  type NDXSessionClientResponseMessage,
  type NDXSessionCreateMessage,
  type NDXSessionCreatedMessage,
  type NDXSessionDeleteMessage,
  type NDXSessionDeletedMessage,
  type NDXSessionEventMessage,
  type NDXSessionHistorySummaryMessage,
  type NDXSessionHistorySummaryResultMessage,
  type NDXSessionInputMessage,
  type NDXSessionInterruptMessage,
  type NDXSessionIterationDetailMessage,
  type NDXSessionIterationDetailResultMessage,
  type NDXSessionListChangedMessage,
  type NDXSessionReadyMessage,
  type NDXSessionRenameMessage,
  type NDXSessionRenamedMessage,
  type NDXSessionSidebarItemMessage,
  type NDXSessionSkillListMessage,
  type NDXSessionSkillListResultMessage,
  type NDXSessionTurnDetailMessage,
  type NDXSessionTurnDetailResultMessage,
  type NDXSessionTurnDeleteMessage,
  type NDXSessionTurnDeletedMessage
} from "./session/index.js";

export type NDXSocketServerMessage =
  | NDXAccountSelectionRequiredMessage
  | NDXAccountSelectedMessage
  | NDXProjectNegotiationRequiredMessage
  | NDXProjectNegotiatedMessage
  | NDXProtocolErrorMessage
  | NDXSessionReadyMessage
  | NDXSessionCreatedMessage
  | NDXSessionBranchCreatedMessage
  | NDXSessionAttachedMessage
  | NDXSessionEventMessage
  | NDXSessionHistorySummaryResultMessage
  | NDXSessionSkillListResultMessage
  | NDXSessionSidebarItemMessage
  | NDXSessionTurnDetailResultMessage
  | NDXSessionIterationDetailResultMessage
  | NDXSessionClientRequestMessage
  | NDXSessionClientRequestClosedMessage
  | NDXSessionDeletedMessage
  | NDXSessionRenamedMessage
  | NDXSessionTurnDeletedMessage
  | NDXSessionListChangedMessage;

export type NDXSocketClientMessage =
  | NDXAccountSelectMessage
  | NDXProjectConfigureMessage
  | NDXSessionCreateMessage
  | NDXSessionAttachMessage
  | NDXSessionInputMessage
  | NDXSessionInterruptMessage
  | NDXSessionDeleteMessage
  | NDXSessionTurnDeleteMessage
  | NDXSessionBranchCreateMessage
  | NDXSessionRenameMessage
  | NDXSessionHistorySummaryMessage
  | NDXSessionTurnDetailMessage
  | NDXSessionIterationDetailMessage
  | NDXSessionSkillListMessage
  | NDXSessionClientResponseMessage;

const NDX_SOCKET_SERVER_MESSAGE_TYPES = new Set<string>([
  NDX_ACCOUNT_SELECTION_REQUIRED,
  NDX_ACCOUNT_SELECTED,
  NDX_PROJECT_NEGOTIATION_REQUIRED,
  NDX_PROJECT_NEGOTIATED,
  NDX_PROTOCOL_ERROR,
  NDX_SESSION_READY,
  NDX_SESSION_CREATED,
  NDX_SESSION_BRANCH_CREATED,
  NDX_SESSION_ATTACHED,
  NDX_SESSION_EVENT,
  NDX_SESSION_HISTORY_SUMMARY_RESULT,
  NDX_SESSION_SKILL_LIST_RESULT,
  NDX_SESSION_SIDEBAR_ITEM,
  NDX_SESSION_TURN_DETAIL_RESULT,
  NDX_SESSION_ITERATION_DETAIL_RESULT,
  NDX_SESSION_CLIENT_REQUEST,
  NDX_SESSION_CLIENT_REQUEST_CLOSED,
  NDX_SESSION_DELETED,
  NDX_SESSION_RENAMED,
  NDX_SESSION_TURN_DELETED,
  NDX_SESSION_LIST_CHANGED
]);

export function isNDXSocketServerMessage(value: unknown): value is NDXSocketServerMessage {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { type?: unknown }).type === "string" &&
    NDX_SOCKET_SERVER_MESSAGE_TYPES.has((value as { type: string }).type)
  );
}
