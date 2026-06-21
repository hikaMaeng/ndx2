import {
  NDX_AGENT_WEB_API,
  type NDXAgentWebAppendSessionMessageRequest,
  type NDXAgentWebPinnedSession,
  type NDXAgentWebSessionDataResponse,
  type NDXAgentWebSessionFavoritesResponse,
  type NDXAgentWebSessionMessageResponse
} from "ndx/webclient/common";
import { requestJson } from "./request.js";

export function listSessionData(sessionid: string) {
  return requestJson<NDXAgentWebSessionDataResponse>(NDX_AGENT_WEB_API.sessionData(sessionid));
}

export function appendSessionMessage(sessionid: string, body: NDXAgentWebAppendSessionMessageRequest) {
  return requestJson<NDXAgentWebSessionMessageResponse>(NDX_AGENT_WEB_API.sessionMessages(sessionid), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function interruptSession(sessionid: string) {
  return requestJson<NDXAgentWebSessionMessageResponse>(NDX_AGENT_WEB_API.sessionInterrupt(sessionid), {
    method: "POST"
  });
}

export async function listPinnedSessions() {
  const data = await requestJson<NDXAgentWebSessionFavoritesResponse>(NDX_AGENT_WEB_API.sessionFavorites);
  return data.sessions;
}

export function pinSession(sessionid: string) {
  return requestJson<NDXAgentWebPinnedSession>(NDX_AGENT_WEB_API.sessionFavorite(sessionid), {
    method: "PUT"
  });
}

export function unpinSession(sessionid: string) {
  return requestJson<void>(NDX_AGENT_WEB_API.sessionFavorite(sessionid), {
    method: "DELETE"
  });
}
