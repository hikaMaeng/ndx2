export const webclientDomain = Object.freeze({
  surface: "webclient",
  runtime: "common"
});

export {
  DEFAULT_NDX_WEB_CLIENT_LOCALE,
  createInitialWebClientState,
  isAbsoluteProjectPath,
  isNDXWebClientLocale,
  makeLocalProject,
  normalizeWebClientState
} from "../server/client-state/state.js";
export type {
  NDXWebClientLocale,
  NDXWebClientProject,
  NDXWebClientSession,
  NDXWebClientStateDocument
} from "../server/client-state/types.js";
export { NDX_AGENT_WEB_API, sessionDataToSessionEvent } from "./protocol/index.js";
export type {
  NDXAgentWebAppendSessionMessageRequest,
  NDXAgentWebClientStateResponse,
  NDXAgentWebContextUsage,
  NDXAgentWebContextUsagePart,
  NDXAgentWebCreateModelRequest,
  NDXAgentWebCreateChatFolderRequest,
  NDXAgentWebCreateChatSessionRequest,
  NDXAgentWebCreateProjectRequest,
  NDXAgentWebCreateProviderRequest,
  NDXAgentWebCreateSessionRequest,
  NDXAgentWebCreateUserRequest,
  NDXAgentWebErrorResponse,
  NDXAgentWebMetadataResponse,
  NDXAgentWebModel,
  NDXAgentWebModelConfig,
  NDXAgentWebModelsResponse,
  NDXReasoningEffort,
  NDXAgentWebProject,
  NDXAgentWebProjectsResponse,
  NDXAgentWebChatFolder,
  NDXAgentWebChatFoldersResponse,
  NDXAgentWebChatSession,
  NDXAgentWebChatSessionsResponse,
  NDXAgentWebProvider,
  NDXAgentWebProvidersResponse,
  NDXAgentWebSession,
  NDXAgentWebSessionData,
  NDXAgentWebSessionDataResponse,
  NDXAgentWebSessionMessageResponse,
  NDXAgentWebSessionMetadata,
  NDXAgentWebSessionsResponse,
  NDXAgentWebUpdateClientStateRequest,
  NDXAgentWebUpdateChatFolderRequest,
  NDXAgentWebUpdateChatSessionRequest,
  NDXAgentWebUpdateModelRequest,
  NDXAgentWebUpdateProjectUserRequest,
  NDXAgentWebUpdateProviderRequest,
  NDXAgentWebUser,
  NDXAgentWebUsersResponse,
  NDXAgentWebWorkspaceDirectoriesResponse,
  NDXAgentWebWorkspaceDirectory,
  NDXAgentWebWorkspaceMetadata
} from "./protocol/index.js";
