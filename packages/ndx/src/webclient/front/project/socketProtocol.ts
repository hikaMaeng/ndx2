import {
  NDX_SESSION_DELETE,
  NDX_SESSION_DELETED,
  NDX_SESSION_LIST_CHANGED,
  NDX_SESSION_RENAME,
  NDX_SESSION_RENAMED,
  type NDXSessionDeleteMessage,
  type NDXSessionDeletedMessage,
  type NDXSessionListChangedMessage,
  type NDXSessionRenameMessage,
  type NDXSessionRenamedMessage,
  type NDXSocketServerMessage
} from "ndx/common/protocol";

export type ProjectSocketMessage = NDXSessionDeletedMessage | NDXSessionListChangedMessage | NDXSessionRenamedMessage;

export type ProjectSessionSocketInput = {
  userid: string;
  projectName: string;
  sessionid: string;
};

export type ProjectSocketHandlers = {
  onSessionDeleted: (message: NDXSessionDeletedMessage) => void;
  onSessionListChanged: (message: NDXSessionListChangedMessage) => void;
  onSessionRenamed: (message: NDXSessionRenamedMessage) => void;
};

export function projectSessionDeleteMessage(input: ProjectSessionSocketInput): NDXSessionDeleteMessage {
  return { type: NDX_SESSION_DELETE, ...input };
}

export function projectSessionRenameMessage(input: ProjectSessionSocketInput & { title: string }): NDXSessionRenameMessage {
  return { type: NDX_SESSION_RENAME, ...input };
}

export function applyProjectSocketMessage(message: NDXSocketServerMessage, handlers: ProjectSocketHandlers) {
  if (message.type === NDX_SESSION_DELETED) {
    handlers.onSessionDeleted(message);
    return true;
  }
  if (message.type === NDX_SESSION_RENAMED) {
    handlers.onSessionRenamed(message);
    return true;
  }
  if (message.type === NDX_SESSION_LIST_CHANGED) {
    handlers.onSessionListChanged(message);
    return true;
  }
  return false;
}

export const handleProjectSocketMessage = applyProjectSocketMessage;

export type { NDXSessionDeletedMessage, NDXSessionListChangedMessage, NDXSessionRenamedMessage };
