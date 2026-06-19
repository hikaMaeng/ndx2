import {
  NDX_AGENT_WEB_API,
  type NDXAgentWebChatFolder,
  type NDXAgentWebChatFoldersResponse,
  type NDXAgentWebChatSession,
  type NDXAgentWebChatSessionsResponse,
  type NDXAgentWebModelConfig,
  type NDXAgentWebSessionDataResponse,
  type NDXAgentWebCreateChatFolderRequest,
  type NDXAgentWebCreateChatSessionRequest,
  type NDXAgentWebUpdateChatFolderRequest,
  type NDXAgentWebUpdateChatSessionRequest
} from "ndx/webclient/common";
import { parseSSEDataFrame } from "../../../common/protocol/index.js";
import { requestJson } from "./request.js";

export type NDXAgentWebChatStreamEvent =
  | { kind: "assistant_delta"; text: string }
  | { kind: "assistant_reasoning"; text?: string; contents?: unknown }
  | { kind: "complete"; session: NDXAgentWebChatSession; data: NDXAgentWebSessionDataResponse["data"] }
  | { kind: "error"; error: string };

export function listChatFolders(userid = "ndev") {
  return requestJson<NDXAgentWebChatFoldersResponse>(`${NDX_AGENT_WEB_API.chatFolders}?userid=${encodeURIComponent(userid)}`);
}

export function createChatFolder(body: NDXAgentWebCreateChatFolderRequest) {
  return requestJson<NDXAgentWebChatFolder>(NDX_AGENT_WEB_API.chatFolders, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function updateChatFolder(folderid: string, body: NDXAgentWebUpdateChatFolderRequest) {
  return requestJson<NDXAgentWebChatFolder>(NDX_AGENT_WEB_API.chatFolder(folderid), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function deleteChatFolder(folderid: string, userid = "ndev") {
  return requestJson<NDXAgentWebChatFolder>(`${NDX_AGENT_WEB_API.chatFolder(folderid)}?userid=${encodeURIComponent(userid)}`, {
    method: "DELETE"
  });
}

export function listChatSessions(folderid: string, userid = "ndev") {
  return requestJson<NDXAgentWebChatSessionsResponse>(`${NDX_AGENT_WEB_API.chatFolderSessions(folderid)}?userid=${encodeURIComponent(userid)}`);
}

export function createChatSession(folderid: string, body: NDXAgentWebCreateChatSessionRequest) {
  return requestJson<NDXAgentWebChatSession>(NDX_AGENT_WEB_API.chatFolderSessions(folderid), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function updateChatSession(chatsessionid: string, body: NDXAgentWebUpdateChatSessionRequest) {
  return requestJson<NDXAgentWebChatSession>(NDX_AGENT_WEB_API.chatSession(chatsessionid), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function deleteChatSession(chatsessionid: string, userid = "ndev") {
  return requestJson<NDXAgentWebChatSession>(`${NDX_AGENT_WEB_API.chatSession(chatsessionid)}?userid=${encodeURIComponent(userid)}`, {
    method: "DELETE"
  });
}

export function listChatSessionData(chatsessionid: string, userid = "ndev") {
  return requestJson<NDXAgentWebSessionDataResponse>(`${NDX_AGENT_WEB_API.chatSessionData(chatsessionid)}?userid=${encodeURIComponent(userid)}`);
}

export function appendChatSessionMessage(chatsessionid: string, body: { text: string; model?: NDXAgentWebModelConfig; userid?: string }) {
  return requestJson<NDXAgentWebSessionDataResponse & { session?: NDXAgentWebChatSession }>(NDX_AGENT_WEB_API.chatSessionMessages(chatsessionid), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function appendChatSessionMessageStream(
  chatsessionid: string,
  body: { text: string; model?: NDXAgentWebModelConfig; userid?: string },
  onEvent: (event: NDXAgentWebChatStreamEvent) => void
) {
  const response = await fetch(NDX_AGENT_WEB_API.chatSessionMessages(chatsessionid), {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body)
  });
  if (!response.ok || !response.body) {
    const errorBody = await response.json().catch(() => undefined) as { error?: unknown } | undefined;
    throw new Error(typeof errorBody?.error === "string" && errorBody.error.trim() ? errorBody.error : `Request failed: ${response.status}`);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let complete: Extract<NDXAgentWebChatStreamEvent, { kind: "complete" }> | undefined;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const payload = parseSSEDataFrame(chunk)?.trim();
      if (!payload) continue;
      const event = JSON.parse(payload) as NDXAgentWebChatStreamEvent;
      onEvent(event);
      if (event.kind === "error") {
        throw new Error(event.error);
      }
      if (event.kind === "complete") {
        complete = event;
      }
    }
    if (done) break;
  }
  if (!complete) {
    throw new Error("채팅 응답이 완료되지 않았습니다.");
  }
  return complete;
}
