import {
  NDX_SESSION_DELETE,
  NDX_SESSION_DELETED,
  NDX_SESSION_LIST_CHANGED,
  NDX_SESSION_RENAME,
  NDX_SESSION_RENAMED,
  type NDXSessionDeletedMessage,
  type NDXSessionListChangedMessage,
  type NDXSessionRenamedMessage
} from "ndx/agent/common/protocol";

export type ProjectSocketMessage = NDXSessionDeletedMessage | NDXSessionListChangedMessage | NDXSessionRenamedMessage;

export type ProjectSessionSocketInput = {
  userid: string;
  projectId: string;
  projectPath: string;
  sessionid: string;
};

export type ProjectSocketHandlers = {
  onSessionDeleted: (message: NDXSessionDeletedMessage) => void;
  onSessionListChanged: (message: NDXSessionListChangedMessage) => void;
  onSessionRenamed: (message: NDXSessionRenamedMessage) => void;
};

export function sendProjectSessionDelete(socket: WebSocket | undefined, input: ProjectSessionSocketInput) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  socket.send(JSON.stringify({ type: NDX_SESSION_DELETE, ...input }));
  return true;
}

export function sendProjectSessionRename(socket: WebSocket | undefined, input: ProjectSessionSocketInput & { title: string }) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  socket.send(JSON.stringify({ type: NDX_SESSION_RENAME, ...input }));
  return true;
}

export function handleProjectSocketMessage(message: { type?: string }, handlers: ProjectSocketHandlers) {
  if (message.type === NDX_SESSION_DELETED) {
    handlers.onSessionDeleted(message as NDXSessionDeletedMessage);
    return true;
  }
  if (message.type === NDX_SESSION_RENAMED) {
    handlers.onSessionRenamed(message as NDXSessionRenamedMessage);
    return true;
  }
  if (message.type === NDX_SESSION_LIST_CHANGED) {
    handlers.onSessionListChanged(message as NDXSessionListChangedMessage);
    return true;
  }
  return false;
}

export type { NDXSessionDeletedMessage, NDXSessionListChangedMessage, NDXSessionRenamedMessage };
