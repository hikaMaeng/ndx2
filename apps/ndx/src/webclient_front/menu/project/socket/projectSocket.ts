import { applyProjectSocketMessage, projectSessionDeleteMessage, projectSessionRenameMessage, type NDXSessionDeletedMessage, type NDXSessionListChangedMessage, type NDXSessionRenamedMessage, type ProjectSessionSocketInput } from "ndx/webclient/front";

export function sendProjectSessionDelete(socket: WebSocket | undefined, input: ProjectSessionSocketInput) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  socket.send(JSON.stringify(projectSessionDeleteMessage(input)));
  return true;
}

export function sendProjectSessionRename(socket: WebSocket | undefined, input: ProjectSessionSocketInput & { title: string }) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  socket.send(JSON.stringify(projectSessionRenameMessage(input)));
  return true;
}

export { applyProjectSocketMessage };
export type { NDXSessionDeletedMessage, NDXSessionListChangedMessage, NDXSessionRenamedMessage };
