export const webclientFrontDomain = Object.freeze({
  surface: "webclient",
  runtime: "front"
});
export { Emitter } from "./model/Emitter.js";
export type { Unsubscribe } from "./model/Emitter.js";
export { SliceModel } from "./model/SliceModel.js";
export type { ModelUpdate } from "./model/SliceModel.js";
export { WebClientBridge } from "./app/model.js";
export type { WebClientBridgeSnapshot, WebClientModalCommand, WebClientModalRequest, WebClientProjectApi, WebClientSurface } from "./app/model.js";
export { WebClientAppShellModel, getWebClientAppShellModel } from "./app/shellModel.js";
export { ChatMenuModel, ProjectMenuModel, getChatMenuModel, getProjectMenuModel } from "./menu/model.js";
export { SettingsSurfaceModel, getSettingsSlice, getSettingsSurfaceModel } from "./settings/model.js";
export type { LocalDirectoryHandleModel, LocalFileHandleModel, LocalFolderSnapshotModel, SettingsStateSetter, SettingsTab } from "./settings/model.js";
export { getMetadata, getWebClientState, listWorkspaceDirectories, putWebClientState } from "./api/app.js";
export { listWebSelfcheck, listWebSelfcheckCandidates, listWebSelfcheckCursors, listWebSelfcheckRuns, runWebSelfcheck, updateWebSelfcheckStatus } from "./api/selfcheck.js";
export { createProjectSession, createUser, createWebProject, createWebProvider, createWebProviderEmbeddingModel, createWebProviderModel, deleteWebProject, deleteWebProvider, deleteWebProviderModel, getWebEmbeddingSettings, getWebSettings, listProjectSessions, listUsers, listWebProjects, listWebProviderEmbeddingModels, listWebProviderModels, listWebProviders, openWebProjectInVSCode, readProviderModelNames, syncWebProviderEmbeddingModels, syncWebProviderModels, updateProjectUser, updateWebEmbeddingSettings, updateWebProvider, updateWebProviderModel, updateWebSettings } from "./api/project.js";
export { appendSessionMessage, interruptSession, listSessionData } from "./api/session.js";
export {
  createChatFolder,
  createChatSession,
  appendChatSessionMessageStream,
  appendChatSessionMessage,
  deleteChatFolder,
  deleteChatSession,
  listChatFolders,
  listChatSessionData,
  listChatSessions,
  updateChatFolder,
  updateChatSession
} from "./api/chat.js";
export type { NDXAgentWebChatStreamEvent } from "./api/chat.js";
export {
  applyChatRequestCompleted,
  applyChatRequestFailed,
  applyChatRequestStarted,
  applyChatSessionLoaded,
  applyChatStreamProgress,
  chatDraftModelKey,
  chatFolderModelKey,
  chatModelToUiState,
  chatModelWithUiState,
  chatSessionModelKey,
  createChatDraftModel,
  createChatFolderModel,
  createChatSessionModel,
  ensureChatModel,
  setChatModelSelectedModel,
  updateChatModel
} from "./chat/model.js";
export type { ChatInstanceModel, ChatModelSnapshot } from "./chat/model.js";
export { ChatSurfaceModelStore, getChatSurfaceModelStore } from "./chat/liveStore.js";
export { requestJson } from "./api/request.js";
export { loadTranslation } from "./i18n/translation.js";
export type { Translation } from "./i18n/translation.js";
export { NDXWebClientSessionUiManager } from "./sessionManager.js";
export type { NDXWebClientSessionUiStateFactory } from "./sessionManager.js";
export type { SocketState } from "./app/socketState.js";
export { DEFAULT_MODEL, fromModelConfig, normalizeReasoningEffort, toModelConfig } from "./model/config.js";
export type { ProviderBundle, SelectedModelConfig } from "./model/config.js";
export { normalizeModalities, optionalNullableNumber, optionalNumber, optionalNumberText, toggleModality } from "./model/form.js";
export { chatMessagesFromSessionDataRows, isPendingUserChatMessage, pendingUserChatMessage, sessionDataContentsAttachments, sessionDataContentsText, sessionDataToChatMessage, sessionDataToVisibleChatMessage, withoutPendingUserChatMessages } from "./session/chat.js";
export type { ChatMessage, ChatMessageAttachment, NDXAgentWebContextUsage } from "./session/chat.js";
export { encodeAttachments, modelAttachmentInputAccept, modelSupportsAttachmentMimeType } from "./session/attachment.js";
export type { EncodedAttachment } from "./session/attachment.js";
export { createSessionUiState } from "./session/uiState.js";
export type { PendingRequest, SessionAttachmentDraft, SessionUiState } from "./session/uiState.js";
export { WebClientSessionSurfaceModel, getWebClientSessionSurfaceModel } from "./session/surfaceModel.js";
export { groupRightSidebarItems, upsertRightSidebarItem } from "./session/rightSidebar.js";
export type { RightSidebarGroup } from "./session/rightSidebar.js";
export { sessionTranscriptItems } from "./session/transcript.js";
export type { SessionTranscriptItem } from "./session/transcript.js";
export { interruptWasAccepted } from "./session/event.js";
export { PROTOCOL_EVENT_UI_REDUCERS, applyProtocolEventToSessionUiState } from "./session/protocolEventReducer.js";
export type { ProtocolEventUiText } from "./session/protocolEventReducer.js";
export { applyIterationDetail, chatMessageFromSessionEvent, chatMessagesFromHistorySummary, mergeRestoredChatMessages, mergeRestoredTurnFlows, mergeTurnSummary, turnFlowFromSummary } from "./session/history.js";
export {
  applyHistoryRequestedToStore,
  applyRoutedSessionMessageToStore,
  applySessionAttachedToStore,
  applySessionHistorySummary,
  applySessionIterationDetail,
  applySessionProtocolEvent,
  applySessionSidebarItem,
  applySessionTurnDetail,
  createDraftSessionIdentity,
  createDraftSessionModel,
  createSessionCapabilitiesModel,
  createSessionComposerModel,
  createSessionConnectionModel,
  createSessionHistoryModel,
  createSessionIdentityFromCreated,
  createSessionIdentityFromRow,
  createSessionModelFromRow,
  createSessionRuntimeModel,
  createSessionSidebarModel,
  createSessionViewportModel,
  draftSessionModelKey,
  ensureDraftSessionModel,
  ensureSessionModel,
  promoteDraftModelInStore,
  promoteDraftSessionModel,
  sessionModelToUiState,
  sessionModelWithUiState,
  updateSessionModel,
  WebClientSessionModelStore,
  getWebClientSessionModelStore
} from "./session/model/index.js";
export type {
  SessionCapabilitiesModel,
  SessionComposerAttachmentModel,
  SessionComposerModel,
  SessionConnectionModel,
  SessionHistoryModel,
  SessionIdentityModel,
  SessionInstanceModel,
  SessionModelRoutedMessage,
  SessionModelSnapshot,
  SessionPendingRequestModel,
  SessionRuntimeModel,
  SessionSidebarModel,
  SessionViewportModel
} from "./session/model/index.js";
export { selectSocketUserid, sessionAccountSelectMessage, sessionAttachMessage, sessionBranchCreateMessage, sessionClientResponseMessage, sessionCreateMessage, sessionHistorySummaryMessage, sessionInputMessage, sessionInterruptMessage, sessionIterationDetailMessage, sessionProjectConfigureMessage, sessionSkillListMessage, sessionSocketUrl, sessionTurnDeleteMessage, sessionTurnDetailMessage, stateAfterSessionReady } from "./session/socketProtocol.js";
export { applyTurnEvent, eventContentText, toolCallIdFromCall, toolNameFromCall, toolProgressText } from "./session/turn/index.js";
export type { TurnBatchState, TurnEventMessage, TurnFlowState, TurnToolState } from "./session/turn/index.js";
export { projectNameForVSCode } from "./project/path.js";
export { applyProjectSocketMessage, handleProjectSocketMessage, projectSessionDeleteMessage, projectSessionRenameMessage } from "./project/socketProtocol.js";
export type { NDXSessionDeletedMessage, NDXSessionListChangedMessage, NDXSessionRenamedMessage, ProjectSessionSocketInput, ProjectSocketHandlers, ProjectSocketMessage } from "./project/socketProtocol.js";
export { cacheClientState, readCachedState, readOrCreateClientId } from "./storage/clientStateCache.js";
