export const agentWebDomain = Object.freeze({
  surface: "agent",
  runtime: "web"
});

export {
  DEFAULT_NDX_WEB_CLIENT_LOCALE,
  createInitialWebClientState,
  isAbsoluteProjectPath,
  isNDXWebClientLocale,
  makeLocalProject,
  normalizeWebClientState
} from "./client-state/state.js";
export type {
  NDXWebClientLocale,
  NDXWebClientProject,
  NDXWebClientSession,
  NDXWebClientStateDocument
} from "./client-state/types.js";
export { NDX_AGENT_WEB_API, sessionDataToSessionEvent } from "./protocol/index.js";
export type {
  NDXAgentWebAppendSessionMessageRequest,
  NDXAgentWebClientStateResponse,
  NDXAgentWebCreateModelRequest,
  NDXAgentWebCreateProviderRequest,
  NDXAgentWebCreateProjectRequest,
  NDXAgentWebCreateSessionRequest,
  NDXAgentWebContextUsage,
  NDXAgentWebContextUsagePart,
  NDXAgentWebCreateUserRequest,
  NDXAgentWebErrorResponse,
  NDXAgentWebMetadataResponse,
  NDXAgentWebModel,
  NDXAgentWebModelConfig,
  NDXAgentWebModelsResponse,
  NDXAgentWebProject,
  NDXAgentWebProvider,
  NDXAgentWebProvidersResponse,
  NDXAgentWebProjectsResponse,
  NDXAgentWebSession,
  NDXAgentWebSessionData,
  NDXAgentWebSessionDataResponse,
  NDXAgentWebSessionMessageResponse,
  NDXAgentWebSessionMetadata,
  NDXAgentWebSessionsResponse,
  NDXAgentWebUpdateClientStateRequest,
  NDXAgentWebUpdateModelRequest,
  NDXAgentWebUpdateProviderRequest,
  NDXAgentWebUpdateProjectActiveRequest,
  NDXAgentWebUpdateProjectUserRequest,
  NDXAgentWebUser,
  NDXAgentWebUsersResponse,
  NDXAgentWebWorkspaceDirectoriesResponse,
  NDXAgentWebWorkspaceDirectory,
  NDXAgentWebWorkspaceMetadata
} from "./protocol/index.js";
