import type { NDXWebClientStateDocument } from "../../server/client-state/index.js";
import { NDX_SESSION_EVENT, NDX_TURN_EVENT, type NDXSessionEventMessage, type NDXSessionEventName } from "../../../common/protocol/index.js";
import type {
  NDXSettingsDocumentInput,
  NDXSettingsDocumentRow,
  NDXSettingsEmbeddingSettingsRow,
  NDXSettingsModelRow,
  NDXSettingsProviderRow,
  NDXSettingsReasoningEffort
} from "../../../common/settings/index.js";

export const NDX_AGENT_WEB_API = Object.freeze({
  metadata: "/api/agent",
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
  webProviderEmbeddingModels: (title: string) => `/api/agent/web-providers/${encodeURIComponent(title)}/embedding-models`,
  webProviderEmbeddingModelSync: (title: string) => `/api/agent/web-providers/${encodeURIComponent(title)}/embedding-models/sync`,
  webSettings: "/api/agent/settings",
  webEmbeddingSettings: "/api/agent/settings/embeddings",
  modelFolderPatchAnalyze: "/api/agent/settings/models/folder/analyze",
  modelFolderPatchApply: "/api/agent/settings/models/folder/patch",
  modelFolderPatchDraft: "/api/agent/settings/models/folder/draft",
  chatFolders: "/api/agent/chat/folders",
  chatFolder: (folderid: string) => `/api/agent/chat/folders/${encodeURIComponent(folderid)}`,
  chatFolderSessions: (folderid: string) => `/api/agent/chat/folders/${encodeURIComponent(folderid)}/sessions`,
  chatSession: (chatsessionid: string) => `/api/agent/chat/sessions/${encodeURIComponent(chatsessionid)}`,
  chatSessionMessages: (chatsessionid: string) => `/api/agent/chat/sessions/${encodeURIComponent(chatsessionid)}/messages`,
  chatSessionData: (chatsessionid: string) => `/api/agent/chat/sessions/${encodeURIComponent(chatsessionid)}/data`,
  sessionFavorites: "/api/agent/session-favorites",
  sessionFavorite: (sessionid: string) => `/api/agent/sessions/${encodeURIComponent(sessionid)}/favorite`,
  projectSessions: (projectName: string) => `/api/agent/projects/${encodeURIComponent(projectName)}/sessions`,
  sessionData: (sessionid: string) => `/api/agent/sessions/${encodeURIComponent(sessionid)}/data`,
  sessionAttachment: (sessionid: string, dataid: string, index: number) =>
    `/api/agent/sessions/${encodeURIComponent(sessionid)}/attachments/${encodeURIComponent(dataid)}/${encodeURIComponent(String(index))}`,
  sessionMessages: (sessionid: string) => `/api/agent/sessions/${encodeURIComponent(sessionid)}/messages`,
  sessionInterrupt: (sessionid: string) => `/api/agent/sessions/${encodeURIComponent(sessionid)}/interrupt`,
  webClientState: "/api/agent/web-client-state",
  selfcheck: "/api/agent/selfcheck",
  selfcheckItem: (selfcheckid: string) => `/api/agent/selfcheck/${encodeURIComponent(selfcheckid)}`,
  selfcheckCandidates: "/api/agent/selfcheck/candidates",
  selfcheckCursors: "/api/agent/selfcheck/cursors",
  selfcheckRuns: "/api/agent/selfcheck/runs",
  selfcheckRun: "/api/agent/selfcheck/run"
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

export type NDXAgentWebProject = {
  projectName: string;
  name: string;
  path: string;
  screenorder: number;
  updatedat: string;
};

export type NDXAgentWebProvider = NDXSettingsProviderRow;

export type NDXAgentWebProvidersResponse = {
  providers: NDXAgentWebProvider[];
};

export type NDXAgentWebCreateProviderRequest = {
  title: string;
  type: "openai";
  url: string;
  token?: string;
  skipSync?: boolean;
};

export type NDXAgentWebUpdateProviderRequest = {
  type?: "openai";
  url?: string;
  token?: string;
};

export type NDXReasoningEffort = NDXSettingsReasoningEffort;

export type NDXAgentWebModel = NDXSettingsModelRow;

export type NDXAgentWebModelsResponse = {
  models: NDXAgentWebModel[];
  syncError?: string;
};

export type NDXAgentWebEmbeddingSettings = NDXSettingsEmbeddingSettingsRow;

export type NDXAgentWebEmbeddingSettingsResponse = {
  embeddings?: NDXAgentWebEmbeddingSettings;
};

export type NDXAgentWebUpdateEmbeddingSettingsRequest = {
  provider: string;
  model: string;
};

export type NDXAgentWebSettingsDocument = NDXSettingsDocumentRow;

export type NDXAgentWebSettingsResponse = {
  settings: NDXAgentWebSettingsDocument;
};

export type NDXAgentWebUpdateSettingsRequest = NDXSettingsDocumentInput;

export type NDXAgentModelFolderPatchRequest = {
  folderPath: string;
};

export type NDXAgentModelFolderPatchResponse = {
  status: "inaccessible" | "needs_patch" | "patched";
  folderPath: string;
  resolvedFolderPath?: string;
  modelFolderName?: string;
  publisher?: string;
  baseModelKey?: string;
  aliasModelKey?: string;
  hubModelYamlPath?: string;
  ggufFiles: string[];
  hasNdxHubPatch: boolean;
  warnings: string[];
  applied?: boolean;
};

export type NDXAgentModelFolderPatchDraftRequest = {
  folderName: string;
  publisher?: string;
  baseModelKey?: string;
  aliasModelKey?: string;
  ggufFiles?: string[];
  existingModelYaml?: string;
  template?: string;
};

export type NDXAgentModelFolderPatchManifest = {
  version: 1;
  createdAt: string;
  folderName: string;
  publisher: string;
  baseModelKey: string;
  aliasModelKey: string;
  outputFileName: "model.yaml";
  originalModelYamlExisted: boolean;
  originalModelYamlSha256?: string;
  backupFileName?: string;
};

export type NDXAgentModelFolderPatchDraftResponse = {
  status: "needs_patch" | "patched";
  folderName: string;
  publisher: string;
  baseModelKey: string;
  aliasModelKey: string;
  ggufFiles: string[];
  modelYaml: string;
  modelYamlFileName: "model.yaml";
  manifest: NDXAgentModelFolderPatchManifest;
  manifestFileName: "ndx-model-patch.json";
  backupFileName?: string;
  backupContents?: string;
  warnings: string[];
};

export type NDXAgentWebCreateModelRequest = {
  model: string;
  contextsize: number;
  modalities?: Array<"text" | "image" | "file">;
  reasoningEffort?: NDXReasoningEffort;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export type NDXAgentWebUpdateModelRequest = {
  contextsize?: number;
  modalities?: Array<"text" | "image" | "file">;
  reasoningEffort?: NDXReasoningEffort | null;
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
};

export type NDXAgentWebModelConfig = {
  type: "openai";
  provider?: string;
  model: string;
  url: string;
  token: string;
  contextsize: number;
  modalities?: Array<"text" | "image" | "file">;
  reasoningEffort?: NDXReasoningEffort;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export type NDXAgentWebSession = {
  sessionid: string;
  title: string;
  lastupdated: string;
  mode: "none" | "light";
  projectname: string;
  path: string;
  model: NDXAgentWebModelConfig;
  isrunning: boolean;
};

export type NDXAgentWebSessionsResponse = {
  sessions: NDXAgentWebSession[];
};

export type NDXAgentWebPinnedSession = NDXAgentWebSession & {
  pinnedat: string;
};

export type NDXAgentWebSessionFavoritesResponse = {
  sessions: NDXAgentWebPinnedSession[];
};

export type NDXAgentWebChatFolder = {
  folderid: string;
  title: string;
  kind: "root" | "normal";
  screenorder: number;
  createdat: string;
  updatedat: string;
};

export type NDXAgentWebChatSession = {
  chatsessionid: string;
  folderid: string;
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
  title: string;
};

export type NDXAgentWebUpdateChatFolderRequest = {
  title: string;
};

export type NDXAgentWebCreateChatSessionRequest = {
  model: NDXAgentWebModelConfig;
  title?: string;
};

export type NDXAgentWebUpdateChatSessionRequest = {
  title: string;
};

export type NDXAgentWebCreateSessionRequest = {
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
  if (kind === "subagent_session") {
    return NDX_TURN_EVENT.SubagentSession;
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
  state: NDXWebClientStateDocument;
  updatedat: string | null;
};

export type NDXAgentWebUpdateClientStateRequest = {
  clientid: string;
  state: unknown;
};

export type NDXAgentWebSelfcheckStatus = "open" | "reviewing" | "accepted" | "dismissed" | "resolved";
export type NDXAgentWebSelfcheckSubjectKind = "tool" | "hook";

export type NDXAgentWebSelfcheck = {
  selfcheckid: string;
  subjectkind: NDXAgentWebSelfcheckSubjectKind;
  subjectname: string;
  category: string;
  severity: string;
  status: NDXAgentWebSelfcheckStatus;
  fingerprint: string;
  title: string;
  summary: string;
  evidence: unknown;
  recommendation: unknown;
  confidence: string | null;
  model: unknown;
  promptversion: string;
  analysiskind: string;
  llmraw: unknown;
  targetsessionid: string | null;
  targetdataid: string | null;
  targetiteration: number | null;
  targetcallid: string | null;
  targethookrunid: string | null;
  firstseenat: string;
  lastseenat: string;
  occurrencecount: number;
  sampledataids: string[];
  createdat: string;
  updatedat: string;
};

export type NDXAgentWebSelfcheckCandidate = {
  candidateid: string;
  subjectkind: NDXAgentWebSelfcheckSubjectKind;
  subjectname: string;
  analyzer: string;
  sessionid: string | null;
  calldataid: string | null;
  resultdataid: string | null;
  hookrunid: string | null;
  fingerprint: string;
  reason: string;
  evidence: unknown;
  status: string;
  attemptcount: number;
  lastattemptat: string | null;
  lasterror: string | null;
  createdat: string;
  updatedat: string;
};

export type NDXAgentWebSelfcheckCursor = {
  analyzer: string;
  subjectkind: NDXAgentWebSelfcheckSubjectKind;
  subjectname: string;
  lastdataid: string;
  settings: unknown;
  laststartedat: string | null;
  lastcompletedat: string | null;
  laststatus: string | null;
  lasterror: string | null;
  updatedat: string;
};

export type NDXAgentWebSelfcheckRun = {
  runid: string;
  analyzer: string;
  subjectkind: NDXAgentWebSelfcheckSubjectKind;
  subjectname: string;
  startedat: string;
  completedat: string | null;
  fromdataid: string;
  todataid: string | null;
  scannedrows: number;
  createdcandidates: number;
  llmanalyses: number;
  createdchecks: number;
  dedupedchecks: number;
  status: string;
  error: string | null;
};

export type NDXAgentWebSelfcheckResponse = {
  selfchecks: NDXAgentWebSelfcheck[];
};

export type NDXAgentWebSelfcheckDetailResponse = {
  selfcheck: NDXAgentWebSelfcheck;
};

export type NDXAgentWebUpdateSelfcheckRequest = {
  status: NDXAgentWebSelfcheckStatus;
};

export type NDXAgentWebSelfcheckCandidatesResponse = {
  candidates: NDXAgentWebSelfcheckCandidate[];
};

export type NDXAgentWebSelfcheckCursorsResponse = {
  cursors: NDXAgentWebSelfcheckCursor[];
};

export type NDXAgentWebSelfcheckRunsResponse = {
  runs: NDXAgentWebSelfcheckRun[];
};

export type NDXAgentWebRunSelfcheckRequest = {
  mode?: "extract" | "analyze" | "all";
  batchSize?: number;
  maxLlmAnalyses?: number;
};

export type NDXAgentWebRunSelfcheckResponse = {
  runid: string;
  createdCandidates: number;
  llmAnalyses: number;
  createdChecks: number;
  dedupedChecks: number;
};
