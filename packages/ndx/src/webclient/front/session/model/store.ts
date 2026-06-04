import type {
  NDXSessionAttachedMessage,
  NDXSessionCreatedMessage,
  NDXSessionEventMessage,
  NDXSessionHistorySummaryResultMessage,
  NDXSessionIterationDetailResultMessage,
  NDXSessionSidebarItemMessage,
  NDXSessionTurnDetailResultMessage
} from "ndx/common/protocol";
import {
  NDX_SESSION_EVENT,
  NDX_SESSION_HISTORY_SUMMARY_RESULT,
  NDX_SESSION_ITERATION_DETAIL_RESULT,
  NDX_SESSION_SIDEBAR_ITEM,
  NDX_SESSION_TURN_DETAIL_RESULT
} from "ndx/common/protocol";
import type { NDXAgentWebSession } from "ndx/webclient/common";
import type { ProtocolEventUiText } from "../protocolEventReducer.js";
import { createDraftSessionModel, createSessionModelFromRow, promoteDraftSessionModel } from "./create.js";
import { applySessionHistorySummary, applySessionIterationDetail, applySessionTurnDetail } from "./historyReducer.js";
import { draftSessionModelKey } from "./identity.js";
import { applySessionProtocolEvent } from "./protocolEventReducer.js";
import { applySessionSidebarItem } from "./sidebarReducer.js";
import type { SessionInstanceModel, SessionModelSnapshot } from "./types.js";

export function ensureDraftSessionModel(snapshot: SessionModelSnapshot, projectName: string): SessionModelSnapshot {
  const key = draftSessionModelKey(projectName);
  return snapshot[key] ? snapshot : { ...snapshot, [key]: createDraftSessionModel(projectName) };
}

export function ensureSessionModel(snapshot: SessionModelSnapshot, session: NDXAgentWebSession): SessionModelSnapshot {
  return snapshot[session.sessionid] ? snapshot : { ...snapshot, [session.sessionid]: createSessionModelFromRow(session) };
}

export function updateSessionModel(snapshot: SessionModelSnapshot, key: string, update: (model: SessionInstanceModel) => SessionInstanceModel): SessionModelSnapshot {
  const model = snapshot[key];
  return model ? { ...snapshot, [key]: update(model) } : snapshot;
}

export function promoteDraftModelInStore(snapshot: SessionModelSnapshot, sourceKey: string | undefined, message: NDXSessionCreatedMessage): SessionModelSnapshot {
  const model = sourceKey ? snapshot[sourceKey] : undefined;
  const promoted = promoteDraftSessionModel(model ?? createDraftSessionModel(message.projectname), message);
  const next = { ...snapshot, [message.sessionid]: promoted };
  if (sourceKey?.startsWith("draft:")) {
    delete next[sourceKey];
  }
  return next;
}

export function applySessionAttachedToStore(snapshot: SessionModelSnapshot, message: NDXSessionAttachedMessage): SessionModelSnapshot {
  return updateSessionModel(snapshot, message.sessionid, (model) => ({
    ...model,
    connection: {
      ...model.connection,
      attached: true,
      connectionToken: message.connectionToken,
      lastAttachedAt: message.createdat
    }
  }));
}

export function applyHistoryRequestedToStore(snapshot: SessionModelSnapshot, sessionid: string): SessionModelSnapshot {
  return updateSessionModel(snapshot, sessionid, (model) => ({
    ...model,
    connection: {
      ...model.connection,
      historyRequested: true
    }
  }));
}

export type SessionModelRoutedMessage =
  | NDXSessionEventMessage
  | NDXSessionHistorySummaryResultMessage
  | NDXSessionSidebarItemMessage
  | NDXSessionTurnDetailResultMessage
  | NDXSessionIterationDetailResultMessage;

export function applyRoutedSessionMessageToStore(snapshot: SessionModelSnapshot, message: SessionModelRoutedMessage, text: ProtocolEventUiText): SessionModelSnapshot {
  const model = snapshot[message.sessionid];
  if (!model) return snapshot;
  if (message.type === NDX_SESSION_EVENT) {
    return { ...snapshot, [message.sessionid]: applySessionProtocolEvent(model, message, text) };
  }
  if (message.type === NDX_SESSION_HISTORY_SUMMARY_RESULT) {
    return { ...snapshot, [message.sessionid]: applySessionHistorySummary(model, message) };
  }
  if (message.type === NDX_SESSION_SIDEBAR_ITEM) {
    return { ...snapshot, [message.sessionid]: applySessionSidebarItem(model, message) };
  }
  if (message.type === NDX_SESSION_TURN_DETAIL_RESULT) {
    return { ...snapshot, [message.sessionid]: applySessionTurnDetail(model, message) };
  }
  if (message.type === NDX_SESSION_ITERATION_DETAIL_RESULT) {
    return { ...snapshot, [message.sessionid]: applySessionIterationDetail(model, message) };
  }
  const exhaustive: never = message;
  return exhaustive;
}
