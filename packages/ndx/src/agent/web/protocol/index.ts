import type { NDXWebClientStateDocument } from "../client-state/index.js";
import { NDX_SESSION_EVENT, NDX_TURN_EVENT, type NDXSessionEventMessage, type NDXSessionEventName } from "../../common/protocol/index.js";

export const NDX_AGENT_WEB_API = Object.freeze({
  metadata: "/api/agent",
  users: "/api/agent/users",
  workspaceDirectories: "/api/agent/workspace-directories",
  webProjects: "/api/agent/web-projects",
  webProject: (projectid: string) => `/api/agent/web-projects/${encodeURIComponent(projectid)}`,
  webProviders: "/api/agent/web-providers",
  webProvider: (title: string) => `/api/agent/web-providers/${encodeURIComponent(title)}`,
  webProviderModels: (title: string) => `/api/agent/web-providers/${encodeURIComponent(title)}/models`,
  webProviderModelSync: (title: string) => `/api/agent/web-providers/${encodeURIComponent(title)}/models/sync`,
  webProviderModel: (title: string, model: string) =>
    `/api/agent/web-providers/${encodeURIComponent(title)}/models/${encodeURIComponent(model)}`,
  webProjectUser: (projectid: string) => `/api/agent/web-projects/${encodeURIComponent(projectid)}/user`,
  webProjectActive: (projectid: string) => `/api/agent/web-projects/${encodeURIComponent(projectid)}/active`,
  projectSessions: (projectid: string) => `/api/agent/projects/${encodeURIComponent(projectid)}/sessions`,
  sessionData: (sessionid: string) => `/api/agent/sessions/${encodeURIComponent(sessionid)}/data`,
  sessionMessages: (sessionid: string) => `/api/agent/sessions/${encodeURIComponent(sessionid)}/messages`,
  sessionInterrupt: (sessionid: string) => `/api/agent/sessions/${encodeURIComponent(sessionid)}/interrupt`,
  webClientState: "/api/agent/web-client-state"
});

export type NDXAgentWebSessionMetadata = {
  path: string;
  healthUrl: string;
  socketUrl: string;
};

export type NDXAgentWebWorkspaceMetadata = {
  hostRoot: string;
  hostWorkspaceRoot: string;
  containerWorkspaceRoot: string;
};

export type NDXAgentWebMetadataResponse = {
  service: "agent";
  version: string;
  surface: string;
  session: NDXAgentWebSessionMetadata;
  workspace: NDXAgentWebWorkspaceMetadata;
};

export type NDXAgentWebErrorResponse = {
  error: string;
};

export type NDXAgentWebUser = {
  userid: string;
  created: string;
};

export type NDXAgentWebUsersResponse = {
  users: NDXAgentWebUser[];
};

export type NDXAgentWebCreateUserRequest = {
  userid: string;
};

export type NDXAgentWebProject = {
  projectid: string;
  path: string;
  target: string;
  screenorder: number;
  userid: string;
  isactive: boolean;
  updatedat: string;
};

export type NDXAgentWebProvider = {
  title: string;
  type: "openai";
  url: string;
  token: string;
};

export type NDXAgentWebProvidersResponse = {
  providers: NDXAgentWebProvider[];
};

export type NDXAgentWebCreateProviderRequest = {
  title: string;
  type: "openai";
  url: string;
  token?: string;
};

export type NDXAgentWebUpdateProviderRequest = {
  type?: "openai";
  url?: string;
  token?: string;
};

export type NDXAgentWebModel = {
  provider: string;
  model: string;
  contextsize: number;
  modalities: Array<"text" | "image" | "file">;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export type NDXAgentWebModelsResponse = {
  models: NDXAgentWebModel[];
  syncError?: string;
};

export type NDXAgentWebCreateModelRequest = {
  model: string;
  contextsize: number;
  modalities?: Array<"text" | "image" | "file">;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export type NDXAgentWebUpdateModelRequest = {
  contextsize?: number;
  modalities?: Array<"text" | "image" | "file">;
  temperature?: number | null;
  topP?: number | null;
  topK?: number | null;
  minP?: number | null;
};

export type NDXAgentWebProjectsResponse = {
  projects: NDXAgentWebProject[];
};

export type NDXAgentWebWorkspaceDirectory = {
  name: string;
  path: string;
};

export type NDXAgentWebWorkspaceDirectoriesResponse = {
  root: string;
  path: string;
  parent?: string;
  directories: NDXAgentWebWorkspaceDirectory[];
};

export type NDXAgentWebCreateProjectRequest = {
  path: string;
  target?: string;
  screenorder?: number;
  userid?: string;
};

export type NDXAgentWebUpdateProjectUserRequest = {
  userid: string;
};

export type NDXAgentWebUpdateProjectActiveRequest = {
  isactive: boolean;
};

export type NDXAgentWebModelConfig = {
  type: "openai";
  model: string;
  url: string;
  token: string;
  contextsize: number;
  modalities?: Array<"text" | "image" | "file">;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export type NDXAgentWebSession = {
  sessionid: string;
  userid: string;
  title: string;
  lastupdated: string;
  mode: "none" | "light";
  path: string;
  projectid: string;
  model: NDXAgentWebModelConfig;
  isrunning: boolean;
};

export type NDXAgentWebSessionsResponse = {
  sessions: NDXAgentWebSession[];
};

export type NDXAgentWebCreateSessionRequest = {
  userid?: string;
  path: string;
  model?: NDXAgentWebModelConfig;
  language?: string;
};

export type NDXAgentWebSessionData = {
  dataid: string;
  sessionid: string;
  type: string;
  contents: unknown;
  createdat: string;
};

export type NDXAgentWebContextUsagePart = {
  key: "developer" | "user" | "history" | "toolDefinitions" | "remaining";
  label: string;
  tokens: number;
  percent: number;
};

export type NDXAgentWebContextUsage = {
  tokens: number;
  messageTokens?: number;
  toolDefinitionTokens?: number;
  percent: number;
  contextsize: number;
  parts?: NDXAgentWebContextUsagePart[];
};

export type NDXAgentWebSessionDataResponse = {
  data: NDXAgentWebSessionData[];
  contextUsage?: NDXAgentWebContextUsage;
};

export function sessionDataToSessionEvent(data: NDXAgentWebSessionData): NDXSessionEventMessage | undefined {
  const event = sessionDataEventName(data);
  if (!event) {
    return undefined;
  }
  return {
    type: NDX_SESSION_EVENT,
    sessionid: data.sessionid,
    event,
    dataid: data.dataid,
    contents: data.contents as NDXSessionEventMessage["contents"],
    createdat: data.createdat
  };
}

function sessionDataEventName(data: NDXAgentWebSessionData): NDXSessionEventName | undefined {
  if (data.type === "user") {
    return NDX_TURN_EVENT.InputRecorded;
  }
  if (data.type === "interrupt") {
    return NDX_TURN_EVENT.Interrupted;
  }
  if (!data.contents || typeof data.contents !== "object") {
    return undefined;
  }

  const kind = (data.contents as { kind?: unknown }).kind;
  if (kind === "assistant_message" || kind === "error") {
    return NDX_TURN_EVENT.AssistantRecorded;
  }
  if (kind === "assistant_delta") {
    return NDX_TURN_EVENT.AssistantDelta;
  }
  if (kind === "assistant_reasoning") {
    return NDX_TURN_EVENT.AssistantReasoning;
  }
  if (kind === "tool_call") {
    return NDX_TURN_EVENT.ToolBatchStarted;
  }
  if (kind === "tool_result") {
    return NDX_TURN_EVENT.ToolResultRecorded;
  }
  return undefined;
}

export type NDXAgentWebAppendSessionMessageRequest = {
  text: string;
  model?: NDXAgentWebModelConfig;
  language?: string;
};

export type NDXAgentWebSessionMessageResponse = {
  session: NDXAgentWebSession;
  data: NDXAgentWebSessionData;
  assistant?: NDXAgentWebSessionData;
  contextUsage?: NDXAgentWebContextUsage;
};

export type NDXAgentWebClientStateResponse = {
  clientid: string;
  userid: string | null;
  state: NDXWebClientStateDocument;
  updatedat: string | null;
};

export type NDXAgentWebUpdateClientStateRequest = {
  clientid: string;
  userid?: string | null;
  state: unknown;
};
