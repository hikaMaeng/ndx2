import type { NDXWebClientStateDocument } from "../../server/client-state/index.js";
import { NDX_SESSION_EVENT, NDX_TURN_EVENT, type NDXSessionEventMessage, type NDXSessionEventName } from "../../../common/protocol/index.js";

export const NDX_AGENT_WEB_API = Object.freeze({
  metadata: "/api/agent",
  users: "/api/agent/users",
  workspaceDirectories: "/api/agent/workspace-directories",
  webProjects: "/api/agent/web-projects",
  webProject: (projectName: string) => `/api/agent/web-projects/${encodeURIComponent(projectName)}`,
  webProjectVSCode: (projectName: string) => `/api/agent/web-projects/${encodeURIComponent(projectName)}/open-vscode`,
  webProviders: "/api/agent/web-providers",
  webProvider: (title: string) => `/api/agent/web-providers/${encodeURIComponent(title)}`,
  webProviderModels: (title: string) => `/api/agent/web-providers/${encodeURIComponent(title)}/models`,
  webProviderModelSync: (title: string) => `/api/agent/web-providers/${encodeURIComponent(title)}/models/sync`,
  webProviderModel: (title: string, model: string) =>
    `/api/agent/web-providers/${encodeURIComponent(title)}/models/${encodeURIComponent(model)}`,
  webProjectUser: (projectName: string) => `/api/agent/web-projects/${encodeURIComponent(projectName)}/user`,
  chatFolders: "/api/agent/chat/folders",
  chatFolder: (folderid: string) => `/api/agent/chat/folders/${encodeURIComponent(folderid)}`,
  chatFolderSessions: (folderid: string) => `/api/agent/chat/folders/${encodeURIComponent(folderid)}/sessions`,
  chatSession: (chatsessionid: string) => `/api/agent/chat/sessions/${encodeURIComponent(chatsessionid)}`,
  chatSessionMessages: (chatsessionid: string) => `/api/agent/chat/sessions/${encodeURIComponent(chatsessionid)}/messages`,
  chatSessionData: (chatsessionid: string) => `/api/agent/chat/sessions/${encodeURIComponent(chatsessionid)}/data`,
  projectSessions: (projectName: string) => `/api/agent/projects/${encodeURIComponent(projectName)}/sessions`,
  sessionData: (sessionid: string) => `/api/agent/sessions/${encodeURIComponent(sessionid)}/data`,
  sessionAttachment: (sessionid: string, dataid: string, index: number) =>
    `/api/agent/sessions/${encodeURIComponent(sessionid)}/attachments/${encodeURIComponent(dataid)}/${encodeURIComponent(String(index))}`,
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
  projectName: string;
  name: string;
  path: string;
  screenorder: number;
  userid: string;
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
  name: string;
  screenorder?: number;
  userid?: string;
};

export type NDXAgentWebUpdateProjectUserRequest = {
  userid: string;
};

export type NDXAgentWebModelConfig = {
  type: "openai";
  provider?: string;
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
  projectname: string;
  path: string;
  model: NDXAgentWebModelConfig;
  isrunning: boolean;
  slidewindow: number;
};

export type NDXAgentWebSessionsResponse = {
  sessions: NDXAgentWebSession[];
};

export type NDXAgentWebChatFolder = {
  folderid: string;
  userid: string;
  title: string;
  kind: "root" | "normal";
  screenorder: number;
  createdat: string;
  updatedat: string;
};

export type NDXAgentWebChatSession = {
  chatsessionid: string;
  folderid: string;
  userid: string;
  title: string;
  model: NDXAgentWebModelConfig;
  isrunning: boolean;
  createdat: string;
  lastupdated: string;
};

export type NDXAgentWebChatFoldersResponse = {
  folders: NDXAgentWebChatFolder[];
};

export type NDXAgentWebChatSessionsResponse = {
  sessions: NDXAgentWebChatSession[];
};

export type NDXAgentWebCreateChatFolderRequest = {
  userid?: string;
  title: string;
};

export type NDXAgentWebUpdateChatFolderRequest = {
  userid?: string;
  title: string;
};

export type NDXAgentWebCreateChatSessionRequest = {
  userid?: string;
  model: NDXAgentWebModelConfig;
  title?: string;
};

export type NDXAgentWebUpdateChatSessionRequest = {
  userid?: string;
  title: string;
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
  chatSession?: NDXAgentWebChatSession;
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
  if (data.type === "compact") {
    return NDX_TURN_EVENT.CompactCompleted;
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
  if (kind === "cot_work") {
    return NDX_TURN_EVENT.CotWork;
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
