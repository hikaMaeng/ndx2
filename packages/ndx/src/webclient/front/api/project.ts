import {
  NDX_AGENT_WEB_API,
  makeLocalProject,
  type NDXAgentWebCreateModelRequest,
  type NDXAgentWebCreateProviderRequest,
  type NDXAgentWebEmbeddingSettingsResponse,
  type NDXAgentWebCreateProjectRequest,
  type NDXAgentWebCreateSessionRequest,
  type NDXAgentWebCreateUserRequest,
  type NDXAgentWebProject,
  type NDXAgentWebProvider,
  type NDXAgentWebProvidersResponse,
  type NDXAgentWebProjectsResponse,
  type NDXAgentWebSession,
  type NDXAgentWebSettingsResponse,
  type NDXAgentWebSessionsResponse,
  type NDXAgentWebModel,
  type NDXAgentWebModelsResponse,
  type NDXAgentWebUpdateEmbeddingSettingsRequest,
  type NDXAgentWebUpdateModelRequest,
  type NDXAgentWebUpdateProjectUserRequest,
  type NDXAgentWebUpdateSettingsRequest,
  type NDXAgentWebUsersResponse,
  type NDXWebClientProject
} from "ndx/webclient/common";
import { requestJson } from "./request.js";

export async function listWebProjects() {
  const data = await requestJson<NDXAgentWebProjectsResponse>(NDX_AGENT_WEB_API.webProjects);
  return data.projects.map(webProjectToClientProject);
}

export async function createWebProject(body: NDXAgentWebCreateProjectRequest) {
  const project = await requestJson<NDXAgentWebProject>(NDX_AGENT_WEB_API.webProjects, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return webProjectToClientProject(project);
}

export function listUsers() {
  return requestJson<NDXAgentWebUsersResponse>(NDX_AGENT_WEB_API.users);
}

export function createUser(body: NDXAgentWebCreateUserRequest) {
  return requestJson(NDX_AGENT_WEB_API.users, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function listProjectSessions(project: Pick<NDXWebClientProject, "projectName" | "userid">) {
  const data = await requestJson<NDXAgentWebSessionsResponse>(
    `${NDX_AGENT_WEB_API.projectSessions(project.projectName)}?userid=${encodeURIComponent(project.userid)}`
  );
  return data.sessions;
}

export function createProjectSession(project: NDXWebClientProject, body?: Partial<NDXAgentWebCreateSessionRequest>) {
  return requestJson<NDXAgentWebSession>(NDX_AGENT_WEB_API.projectSessions(project.projectName), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userid: project.userid, ...body })
  });
}

export function updateProjectUser(projectName: string, userid: string) {
  const body: NDXAgentWebUpdateProjectUserRequest = { userid };
  return requestJson<NDXAgentWebProject>(NDX_AGENT_WEB_API.webProjectUser(projectName), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function webProjectToClientProject(project: NDXAgentWebProject) {
  return makeLocalProject({
    projectName: project.projectName,
    name: project.name,
    path: project.path,
    screenorder: project.screenorder,
    userid: project.userid
  } as Parameters<typeof makeLocalProject>[0]);
}

export function deleteWebProject(projectName: string) {
  return requestJson<NDXAgentWebProject>(NDX_AGENT_WEB_API.webProject(projectName), { method: "DELETE" });
}

export function openWebProjectInVSCode(projectName: string) {
  return requestJson<void>(NDX_AGENT_WEB_API.webProjectVSCode(projectName), { method: "POST" });
}

export async function listWebProviders() {
  const data = await requestJson<NDXAgentWebProvidersResponse>(NDX_AGENT_WEB_API.webProviders);
  return data.providers as NDXAgentWebProvider[];
}

export async function listWebProviderModels(title: string) {
  const data = await requestJson<NDXAgentWebModelsResponse>(NDX_AGENT_WEB_API.webProviderModels(title));
  return data.models as NDXAgentWebModel[];
}

export async function listWebProviderEmbeddingModels(title: string) {
  const data = await requestJson<NDXAgentWebModelsResponse>(NDX_AGENT_WEB_API.webProviderEmbeddingModels(title));
  return data.models as NDXAgentWebModel[];
}

export async function syncWebProviderModels(title: string) {
  const data = await requestJson<NDXAgentWebModelsResponse>(NDX_AGENT_WEB_API.webProviderModelSync(title), { method: "POST" });
  return { models: data.models as NDXAgentWebModel[], syncError: data.syncError };
}

export async function syncWebProviderEmbeddingModels(title: string) {
  const data = await requestJson<NDXAgentWebModelsResponse>(NDX_AGENT_WEB_API.webProviderEmbeddingModelSync(title), { method: "POST" });
  return { models: data.models as NDXAgentWebModel[], syncError: data.syncError };
}

export async function readProviderModelNames(provider: Pick<NDXAgentWebProvider, "url" | "token">) {
  const providerUrl = new URL(provider.url.trim());
  const normalizedPath = providerUrl.pathname.replace(/\/$/, "");
  const endpoints = [new URL(`${normalizedPath}/models`, providerUrl)];
  if (!normalizedPath.endsWith("/v1")) {
    endpoints.push(new URL(`${normalizedPath}/v1/models`, providerUrl));
  }

  let lastError = "";
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { headers: provider.token ? { Authorization: `Bearer ${provider.token}` } : {} });
      if (response.ok) {
        const body = (await response.json()) as { data?: Array<{ id?: string }> };
        return Array.isArray(body.data) ? body.data.map((item) => typeof item.id === "string" ? item.id.trim() : "").filter(Boolean) : [];
      }
      lastError = `${endpoint.toString()} returned ${response.status}`;
    } catch (error) {
      lastError = `${endpoint.toString()} failed: ${error instanceof Error ? error.message : "unknown error"}`;
    }
  }
  throw new Error(lastError || "provider model fetch failed.");
}

export function createWebProvider(body: NDXAgentWebCreateProviderRequest) {
  return requestJson<NDXAgentWebProvider>(NDX_AGENT_WEB_API.webProviders, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function updateWebProvider(title: string, body: Partial<NDXAgentWebCreateProviderRequest>) {
  return requestJson<NDXAgentWebProvider>(NDX_AGENT_WEB_API.webProvider(title), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function createWebProviderModel(title: string, body: NDXAgentWebCreateModelRequest) {
  return requestJson<NDXAgentWebModel>(NDX_AGENT_WEB_API.webProviderModels(title), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function createWebProviderEmbeddingModel(title: string, body: Pick<NDXAgentWebCreateModelRequest, "model">) {
  return requestJson<NDXAgentWebModel>(NDX_AGENT_WEB_API.webProviderEmbeddingModels(title), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function updateWebProviderModel(title: string, model: string, body: NDXAgentWebUpdateModelRequest) {
  return requestJson<NDXAgentWebModel>(NDX_AGENT_WEB_API.webProviderModel(title, model), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function deleteWebProvider(title: string) {
  return requestJson<void>(NDX_AGENT_WEB_API.webProvider(title), { method: "DELETE" });
}

export function deleteWebProviderModel(title: string, model: string) {
  return requestJson<void>(NDX_AGENT_WEB_API.webProviderModel(title, model), { method: "DELETE" });
}

export async function getWebEmbeddingSettings() {
  const data = await requestJson<NDXAgentWebEmbeddingSettingsResponse>(NDX_AGENT_WEB_API.webEmbeddingSettings);
  return data.embeddings;
}

export function updateWebEmbeddingSettings(body: NDXAgentWebUpdateEmbeddingSettingsRequest) {
  return requestJson<NDXAgentWebEmbeddingSettingsResponse>(NDX_AGENT_WEB_API.webEmbeddingSettings, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function getWebSettings() {
  const data = await requestJson<NDXAgentWebSettingsResponse>(NDX_AGENT_WEB_API.webSettings);
  return data.settings;
}

export function updateWebSettings(body: NDXAgentWebUpdateSettingsRequest) {
  return requestJson<NDXAgentWebSettingsResponse>(NDX_AGENT_WEB_API.webSettings, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
