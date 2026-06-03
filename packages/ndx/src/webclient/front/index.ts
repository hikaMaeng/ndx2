export const webclientFrontDomain = Object.freeze({
  surface: "webclient",
  runtime: "front"
});
export { getMetadata, getWebClientState, listWorkspaceDirectories, putWebClientState } from "./api/app.js";
export { createProjectSession, createUser, createWebProject, createWebProvider, createWebProviderModel, deleteWebProject, deleteWebProvider, deleteWebProviderModel, listProjectSessions, listUsers, listWebProjects, listWebProviderModels, listWebProviders, openWebProjectInVSCode, readProviderModelNames, syncWebProviderModels, updateProjectUser, updateWebProviderModel } from "./api/project.js";
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
export { requestJson } from "./api/request.js";
export { loadTranslation } from "./i18n/translation.js";
export type { Translation } from "./i18n/translation.js";
export { NDXWebClientSessionUiManager } from "./sessionManager.js";
export type { NDXWebClientSessionUiStateFactory } from "./sessionManager.js";
export type { SocketState } from "./app/socketState.js";
export { DEFAULT_MODEL, fromModelConfig, toModelConfig } from "./model/config.js";
export type { ProviderBundle, SelectedModelConfig } from "./model/config.js";
export { normalizeModalities, optionalNullableNumber, optionalNumber, optionalNumberText, toggleModality } from "./model/form.js";
export { sessionDataContentsAttachments, sessionDataContentsText, sessionDataToChatMessage, sessionDataToVisibleChatMessage } from "./session/chat.js";
export type { ChatMessage, ChatMessageAttachment, NDXAgentWebContextUsage } from "./session/chat.js";
export { encodeAttachments, modelAttachmentInputAccept, modelSupportsAttachmentMimeType } from "./session/attachment.js";
export type { EncodedAttachment } from "./session/attachment.js";
export { createSessionUiState } from "./session/uiState.js";
export type { PendingRequest, SessionAttachmentDraft, SessionUiState } from "./session/uiState.js";
export { interruptWasAccepted } from "./session/event.js";
export { applyIterationDetail, chatMessageFromSessionEvent, mergeRestoredChatMessages, mergeRestoredTurnFlows, mergeTurnSummary, turnFlowFromSummary } from "./session/history.js";
export { selectSocketUserid, sessionAccountSelectMessage, sessionAttachMessage, sessionClientResponseMessage, sessionCreateMessage, sessionHistorySummaryMessage, sessionInputMessage, sessionInterruptMessage, sessionIterationDetailMessage, sessionProjectConfigureMessage, sessionSkillListMessage, sessionSlideWindowUpdateMessage, sessionSocketUrl, sessionTurnDetailMessage, stateAfterSessionReady } from "./session/socketProtocol.js";
export { applyTurnEvent, eventContentText, toolCallIdFromCall, toolNameFromCall, toolProgressText } from "./session/turn/index.js";
export type { TurnBatchState, TurnEventMessage, TurnFlowState, TurnToolState } from "./session/turn/index.js";
export { projectNameForVSCode } from "./project/path.js";
export { applyProjectSocketMessage, handleProjectSocketMessage, projectSessionDeleteMessage, projectSessionRenameMessage } from "./project/socketProtocol.js";
export type { NDXSessionDeletedMessage, NDXSessionListChangedMessage, NDXSessionRenamedMessage, ProjectSessionSocketInput, ProjectSocketHandlers, ProjectSocketMessage } from "./project/socketProtocol.js";
export { cacheClientState, readCachedState, readOrCreateClientId } from "./storage/clientStateCache.js";
