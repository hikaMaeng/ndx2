import {
  NDX_AGENT_WEB_API,
  normalizeWebClientState,
  type NDXAgentWebClientStateResponse,
  type NDXAgentWebMetadataResponse,
  type NDXAgentWebUpdateClientStateRequest,
  type NDXAgentWebWorkspaceDirectoriesResponse,
  type NDXWebClientStateDocument
} from "ndx/webclient/common";
import { requestJson } from "./request.js";

export function getMetadata() {
  return requestJson<NDXAgentWebMetadataResponse>(NDX_AGENT_WEB_API.metadata);
}

export function getWebClientState(clientid: string) {
  return requestJson<NDXAgentWebClientStateResponse>(
    `${NDX_AGENT_WEB_API.webClientState}?clientid=${encodeURIComponent(clientid)}`
  );
}

export function listWorkspaceDirectories(path = "") {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return requestJson<NDXAgentWebWorkspaceDirectoriesResponse>(`${NDX_AGENT_WEB_API.workspaceDirectories}${query}`);
}

export async function putWebClientState(clientid: string, state: NDXWebClientStateDocument) {
  const normalized = normalizeWebClientState(state);
  const body: NDXAgentWebUpdateClientStateRequest = {
    clientid,
    state: normalized
  };
  return requestJson<NDXAgentWebClientStateResponse>(NDX_AGENT_WEB_API.webClientState, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
