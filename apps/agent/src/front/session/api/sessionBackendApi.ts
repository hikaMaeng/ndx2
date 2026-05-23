import {
  NDX_AGENT_WEB_API,
  type NDXAgentWebAppendSessionMessageRequest,
  type NDXAgentWebSessionDataResponse,
  type NDXAgentWebSessionMessageResponse
} from "ndx/agent/web";
import { requestJson } from "../../app/api/backendRequest";

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
