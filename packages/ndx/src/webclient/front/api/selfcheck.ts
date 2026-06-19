import {
  NDX_AGENT_WEB_API,
  type NDXAgentWebRunSelfcheckRequest,
  type NDXAgentWebRunSelfcheckResponse,
  type NDXAgentWebSelfcheckCandidatesResponse,
  type NDXAgentWebSelfcheckCursorsResponse,
  type NDXAgentWebSelfcheckDetailResponse,
  type NDXAgentWebSelfcheckResponse,
  type NDXAgentWebSelfcheckRunsResponse,
  type NDXAgentWebSelfcheckStatus
} from "ndx/webclient/common";
import { requestJson } from "./request.js";

export async function listWebSelfcheck(filters: { status?: string; subjectkind?: string; subjectname?: string } = {}) {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.subjectkind) query.set("subjectkind", filters.subjectkind);
  if (filters.subjectname) query.set("subjectname", filters.subjectname);
  const suffix = query.toString();
  const data = await requestJson<NDXAgentWebSelfcheckResponse>(`${NDX_AGENT_WEB_API.selfcheck}${suffix ? `?${suffix}` : ""}`);
  return data.selfchecks;
}

export async function updateWebSelfcheckStatus(selfcheckid: string, status: NDXAgentWebSelfcheckStatus) {
  const data = await requestJson<NDXAgentWebSelfcheckDetailResponse>(NDX_AGENT_WEB_API.selfcheckItem(selfcheckid), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  return data.selfcheck;
}

export async function listWebSelfcheckCandidates() {
  const data = await requestJson<NDXAgentWebSelfcheckCandidatesResponse>(NDX_AGENT_WEB_API.selfcheckCandidates);
  return data.candidates;
}

export async function listWebSelfcheckCursors() {
  const data = await requestJson<NDXAgentWebSelfcheckCursorsResponse>(NDX_AGENT_WEB_API.selfcheckCursors);
  return data.cursors;
}

export async function listWebSelfcheckRuns() {
  const data = await requestJson<NDXAgentWebSelfcheckRunsResponse>(NDX_AGENT_WEB_API.selfcheckRuns);
  return data.runs;
}

export function runWebSelfcheck(body: NDXAgentWebRunSelfcheckRequest): Promise<NDXAgentWebRunSelfcheckResponse> {
  return requestJson<NDXAgentWebRunSelfcheckResponse>(NDX_AGENT_WEB_API.selfcheckRun, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
