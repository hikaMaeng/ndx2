import { NDX_AGENT_WEB_API, type NDXAgentModelFolderPatchDraftRequest, type NDXAgentModelFolderPatchDraftResponse, type NDXAgentModelFolderPatchResponse } from "ndx/webclient/common";

export async function analyzeModelFolderPatch(folderPath: string): Promise<NDXAgentModelFolderPatchResponse> {
  return requestModelFolderPatch(NDX_AGENT_WEB_API.modelFolderPatchAnalyze, folderPath);
}

export async function applyModelFolderPatch(folderPath: string): Promise<NDXAgentModelFolderPatchResponse> {
  return requestModelFolderPatch(NDX_AGENT_WEB_API.modelFolderPatchApply, folderPath);
}

export async function draftModelFolderPatch(input: NDXAgentModelFolderPatchDraftRequest): Promise<NDXAgentModelFolderPatchDraftResponse> {
  const response = await fetch(NDX_AGENT_WEB_API.modelFolderPatchDraft, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await response.json().catch(() => ({})) as NDXAgentModelFolderPatchDraftResponse | { error?: string };
  if (!response.ok) {
    throw new Error("error" in body && typeof body.error === "string" ? body.error : "모델 패치 초안 생성이 실패했습니다.");
  }
  return body as NDXAgentModelFolderPatchDraftResponse;
}

async function requestModelFolderPatch(endpoint: string, folderPath: string): Promise<NDXAgentModelFolderPatchResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderPath })
  });
  const body = await response.json().catch(() => ({})) as NDXAgentModelFolderPatchResponse | { error?: string };
  if (!response.ok) {
    throw new Error("error" in body && typeof body.error === "string" ? body.error : "모델 폴더 요청이 실패했습니다.");
  }
  return body as NDXAgentModelFolderPatchResponse;
}
