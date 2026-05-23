import type { NDXSessionDataContents, NDXSessionEventContextUsage, NDXSessionEventName } from "./data.js";
import type { NDXAgentLanguage } from "../../resource/index.js";

export const NDX_SESSION_INPUT = "session.input";
export const NDX_SESSION_INTERRUPT = "session.interrupt";
export const NDX_SESSION_EVENT = "session.event";
export const NDX_SESSION_CREATE = "session.create";
export const NDX_SESSION_CREATED = "session.created";
export const NDX_SESSION_ATTACH = "session.attach";
export const NDX_SESSION_ATTACHED = "session.attached";
export const NDX_SESSION_DELETE = "session.delete";
export const NDX_SESSION_DELETED = "session.deleted";
export const NDX_SESSION_RENAME = "session.rename";
export const NDX_SESSION_RENAMED = "session.renamed";
export const NDX_SESSION_LIST_CHANGED = "session.list.changed";
export const NDX_SESSION_HISTORY_SUMMARY = "session.history.summary";
export const NDX_SESSION_HISTORY_SUMMARY_RESULT = "session.history.summary.result";
export const NDX_SESSION_TURN_DETAIL = "session.turn.detail";
export const NDX_SESSION_TURN_DETAIL_RESULT = "session.turn.detail.result";
export const NDX_SESSION_ITERATION_DETAIL = "session.iteration.detail";
export const NDX_SESSION_ITERATION_DETAIL_RESULT = "session.iteration.detail.result";
export const NDX_SESSION_SKILL_LIST = "session.skill.list";
export const NDX_SESSION_SKILL_LIST_RESULT = "session.skill.list.result";

export type NDXSessionModelConfig = {
  type: "openai";
  model: string;
  url: string;
  token: string;
  contextsize: number;
  modalities?: Array<"text" | "image" | "file">;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export type NDXSessionCreateMessage = {
  type: typeof NDX_SESSION_CREATE;
  userid?: string;
  projectId?: string;
  projectPath?: string;
  model?: NDXSessionModelConfig;
  language?: NDXAgentLanguage;
};

export type NDXSessionCreatedMessage = {
  type: typeof NDX_SESSION_CREATED;
  connectionToken?: string;
  sessionid: string;
  userid: string;
  title: string;
  lastupdated: string;
  mode: "none" | "light";
  path: string;
  projectid: string;
  model: NDXSessionModelConfig;
  isrunning: boolean;
};

export type NDXSessionAttachMessage = {
  type: typeof NDX_SESSION_ATTACH;
  userid: string;
  projectId: string;
  projectPath: string;
  sessionid: string;
  language?: NDXAgentLanguage;
};

export type NDXSessionAttachedMessage = {
  type: typeof NDX_SESSION_ATTACHED;
  connectionToken: string;
  createdat: string;
  sessionid: string;
  userid: string;
  projectId: string;
  projectPath: string;
};

export type NDXSessionDeleteMessage = {
  type: typeof NDX_SESSION_DELETE;
  userid: string;
  projectId: string;
  projectPath: string;
  sessionid: string;
  language?: NDXAgentLanguage;
};

export type NDXSessionDeletedMessage = {
  type: typeof NDX_SESSION_DELETED;
  sessionid: string;
  userid: string;
  projectid: string;
};

export type NDXSessionRenameMessage = {
  type: typeof NDX_SESSION_RENAME;
  userid: string;
  projectId: string;
  projectPath: string;
  sessionid: string;
  title: string;
  language?: NDXAgentLanguage;
};

export type NDXSessionRenamedMessage = {
  type: typeof NDX_SESSION_RENAMED;
  sessionid: string;
  userid: string;
  title: string;
  lastupdated: string;
  mode: "none" | "light";
  path: string;
  projectid: string;
  model: NDXSessionModelConfig;
  isrunning: boolean;
};

export type NDXSessionListChangedMessage = {
  type: typeof NDX_SESSION_LIST_CHANGED;
  userid: string;
  projectid: string;
};

export type NDXSessionInputMessage = {
  type: typeof NDX_SESSION_INPUT;
  connectionToken: string;
  text: string;
  attachments?: NDXSessionInputAttachment[];
  model?: NDXSessionModelConfig;
  language?: NDXAgentLanguage;
};

export type NDXSessionInputAttachment = {
  name: string;
  mimeType: string;
  size: number;
  data: string;
};

export type NDXSessionSkillSummary = {
  name: string;
  description: string;
  scope: "user" | "repo" | "system";
};

export type NDXSessionSkillListMessage = {
  type: typeof NDX_SESSION_SKILL_LIST;
  connectionToken?: string;
  language?: NDXAgentLanguage;
};

export type NDXSessionSkillListResultMessage = {
  type: typeof NDX_SESSION_SKILL_LIST_RESULT;
  skills: NDXSessionSkillSummary[];
};

export type NDXSessionInterruptMessage = {
  type: typeof NDX_SESSION_INTERRUPT;
  connectionToken: string;
  language?: NDXAgentLanguage;
};

export type NDXSessionEventMessage = {
  type: typeof NDX_SESSION_EVENT;
  sessionid: string;
  event: NDXSessionEventName;
  dataid: string;
  contents: NDXSessionDataContents | Record<string, unknown> | string;
  createdat: string;
  contextUsage?: NDXSessionEventContextUsage;
};

export type NDXSessionIterationSummary = {
  iteration: number;
  eventCount: number;
  hasAssistantText: boolean;
  hasTools: boolean;
};

export type NDXSessionTurnSummary = {
  inputDataId: string;
  sessionid: string;
  title: string;
  status: "running" | "interrupted" | "completed";
  createdat: string;
  updatedat: string;
  iterations: NDXSessionIterationSummary[];
};

export type NDXSessionHistorySummaryMessage = {
  type: typeof NDX_SESSION_HISTORY_SUMMARY;
  connectionToken: string;
  language?: NDXAgentLanguage;
};

export type NDXSessionHistorySummaryResultMessage = {
  type: typeof NDX_SESSION_HISTORY_SUMMARY_RESULT;
  sessionid: string;
  visibleEvents: NDXSessionEventMessage[];
  turns: NDXSessionTurnSummary[];
};

export type NDXSessionTurnDetailMessage = {
  type: typeof NDX_SESSION_TURN_DETAIL;
  connectionToken: string;
  inputDataId: string;
  language?: NDXAgentLanguage;
};

export type NDXSessionTurnDetailResultMessage = {
  type: typeof NDX_SESSION_TURN_DETAIL_RESULT;
  sessionid: string;
  turn?: NDXSessionTurnSummary;
};

export type NDXSessionIterationDetailMessage = {
  type: typeof NDX_SESSION_ITERATION_DETAIL;
  connectionToken: string;
  inputDataId: string;
  iteration: number;
  language?: NDXAgentLanguage;
};

export type NDXSessionIterationDetailResultMessage = {
  type: typeof NDX_SESSION_ITERATION_DETAIL_RESULT;
  sessionid: string;
  inputDataId: string;
  iteration: number;
  events: NDXSessionEventMessage[];
};

export function isNDXSessionInputMessage(value: unknown): value is NDXSessionInputMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { type?: unknown; connectionToken?: unknown; text?: unknown; attachments?: unknown; language?: unknown };
  return (
    message.type === NDX_SESSION_INPUT &&
    typeof message.connectionToken === "string" &&
    message.connectionToken.trim().length > 0 &&
    typeof message.text === "string" &&
    (message.text.trim().length > 0 || isValidSessionInputAttachments(message.attachments)) &&
    (message.attachments === undefined || isValidSessionInputAttachments(message.attachments)) &&
    (message.language === undefined || message.language === "en" || message.language === "ko")
  );
}

function isValidSessionInputAttachments(value: unknown): value is NDXSessionInputAttachment[] {
  if (!Array.isArray(value)) {
    return false;
  }
  if (value.length === 0 || value.length > 8) {
    return false;
  }
  return value.every((attachment) => {
    if (!attachment || typeof attachment !== "object") {
      return false;
    }
    const next = attachment as Partial<NDXSessionInputAttachment>;
    return (
      typeof next.name === "string" &&
      next.name.trim().length > 0 &&
      typeof next.mimeType === "string" &&
      next.mimeType.trim().length > 0 &&
      typeof next.size === "number" &&
      Number.isFinite(next.size) &&
      next.size > 0 &&
      next.size <= 10 * 1024 * 1024 &&
      typeof next.data === "string" &&
      next.data.trim().length > 0
    );
  });
}

export function isNDXSessionSkillListMessage(value: unknown): value is NDXSessionSkillListMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { type?: unknown; connectionToken?: unknown };
  return (
    message.type === NDX_SESSION_SKILL_LIST &&
    (message.connectionToken === undefined || (typeof message.connectionToken === "string" && message.connectionToken.trim().length > 0))
  );
}

export function isNDXSessionAttachMessage(value: unknown): value is NDXSessionAttachMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { type?: unknown; userid?: unknown; projectId?: unknown; projectPath?: unknown; sessionid?: unknown };
  return (
    message.type === NDX_SESSION_ATTACH &&
    typeof message.userid === "string" &&
    message.userid.trim().length > 0 &&
    typeof message.projectId === "string" &&
    message.projectId.trim().length > 0 &&
    typeof message.projectPath === "string" &&
    message.projectPath.trim().length > 0 &&
    typeof message.sessionid === "string" &&
    message.sessionid.trim().length > 0
  );
}

export function isNDXSessionCreateMessage(value: unknown): value is NDXSessionCreateMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { type?: unknown; userid?: unknown; projectId?: unknown; projectPath?: unknown; model?: unknown };
  if (message.type !== NDX_SESSION_CREATE) {
    return false;
  }

  const hasCreateTarget = message.userid !== undefined || message.projectId !== undefined || message.projectPath !== undefined;
  if (
    hasCreateTarget &&
    !(
      typeof message.userid === "string" &&
      message.userid.trim().length > 0 &&
      typeof message.projectId === "string" &&
      message.projectId.trim().length > 0 &&
      typeof message.projectPath === "string" &&
      message.projectPath.trim().length > 0
    )
  ) {
    return false;
  }

  if (message.model === undefined) {
    return true;
  }

  if (!message.model || typeof message.model !== "object") {
    return false;
  }

  const model = message.model as { type?: unknown; model?: unknown; url?: unknown; token?: unknown; contextsize?: unknown; modalities?: unknown };
  return (
    model.type === "openai" &&
    typeof model.model === "string" &&
    model.model.trim().length > 0 &&
    typeof model.url === "string" &&
    typeof model.token === "string" &&
    typeof model.contextsize === "number" &&
    Number.isFinite(model.contextsize) &&
    model.contextsize > 0 &&
    (model.modalities === undefined ||
      (Array.isArray(model.modalities) &&
        model.modalities.every((modality) => modality === "text" || modality === "image" || modality === "file")))
  );
}

export function isNDXSessionDeleteMessage(value: unknown): value is NDXSessionDeleteMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { type?: unknown; userid?: unknown; projectId?: unknown; projectPath?: unknown; sessionid?: unknown };
  return (
    message.type === NDX_SESSION_DELETE &&
    typeof message.userid === "string" &&
    message.userid.trim().length > 0 &&
    typeof message.projectId === "string" &&
    message.projectId.trim().length > 0 &&
    typeof message.projectPath === "string" &&
    message.projectPath.trim().length > 0 &&
    typeof message.sessionid === "string" &&
    message.sessionid.trim().length > 0
  );
}

export function isNDXSessionRenameMessage(value: unknown): value is NDXSessionRenameMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { type?: unknown; userid?: unknown; projectId?: unknown; projectPath?: unknown; sessionid?: unknown; title?: unknown };
  return (
    message.type === NDX_SESSION_RENAME &&
    typeof message.userid === "string" &&
    message.userid.trim().length > 0 &&
    typeof message.projectId === "string" &&
    message.projectId.trim().length > 0 &&
    typeof message.projectPath === "string" &&
    message.projectPath.trim().length > 0 &&
    typeof message.sessionid === "string" &&
    message.sessionid.trim().length > 0 &&
    typeof message.title === "string"
  );
}

export function isNDXSessionInterruptMessage(value: unknown): value is NDXSessionInterruptMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { type?: unknown; connectionToken?: unknown };
  return message.type === NDX_SESSION_INTERRUPT && typeof message.connectionToken === "string" && message.connectionToken.trim().length > 0;
}

export function isNDXSessionHistorySummaryMessage(value: unknown): value is NDXSessionHistorySummaryMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as { type?: unknown; connectionToken?: unknown };
  return message.type === NDX_SESSION_HISTORY_SUMMARY && typeof message.connectionToken === "string" && message.connectionToken.trim().length > 0;
}

export function isNDXSessionTurnDetailMessage(value: unknown): value is NDXSessionTurnDetailMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as { type?: unknown; connectionToken?: unknown; inputDataId?: unknown };
  return (
    message.type === NDX_SESSION_TURN_DETAIL &&
    typeof message.connectionToken === "string" &&
    message.connectionToken.trim().length > 0 &&
    typeof message.inputDataId === "string" &&
    message.inputDataId.trim().length > 0
  );
}

export function isNDXSessionIterationDetailMessage(value: unknown): value is NDXSessionIterationDetailMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as { type?: unknown; connectionToken?: unknown; inputDataId?: unknown; iteration?: unknown };
  return (
    message.type === NDX_SESSION_ITERATION_DETAIL &&
    typeof message.connectionToken === "string" &&
    message.connectionToken.trim().length > 0 &&
    typeof message.inputDataId === "string" &&
    message.inputDataId.trim().length > 0 &&
    typeof message.iteration === "number" &&
    Number.isInteger(message.iteration) &&
    message.iteration > 0
  );
}
