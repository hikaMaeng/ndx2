import { createSessionUiState, type SessionUiState } from "../uiState.js";
import type { SessionInstanceModel } from "./types.js";

export function sessionModelToUiState(model: SessionInstanceModel): SessionUiState {
  return {
    ...createSessionUiState(),
    chatInput: model.composer.input,
    chatAttachments: model.composer.attachments,
    availableSkills: model.capabilities.availableSkills,
    skillListRequested: model.connection.skillListRequested,
    agentRunning: model.runtime.agentRunning,
    compactRunning: model.runtime.compactRunning,
    selectedModel: model.composer.selectedModel,
    chatMessages: model.history.messages,
    turnFlows: model.history.turns,
    cotWork: model.runtime.cotWork,
    requestQueue: model.runtime.requestQueue,
    subsessions: model.subsessions,
    requestQueueCollapsed: model.runtime.requestQueueCollapsed,
    autoScrollEnabled: model.viewport.autoScrollEnabled,
    reportedContextUsage: model.runtime.contextUsage,
    notice: model.runtime.notice,
    sessionError: model.runtime.error,
    rightSidebarOpen: model.sidebar.open,
    rightSidebarItems: model.sidebar.items,
    rightSidebarWidth: model.sidebar.width,
    chatScrollTop: model.viewport.chatScrollTop,
    rightSidebarScrollTop: model.sidebar.scrollTop,
    pendingInitialRequest: model.composer.pendingInitialRequest,
    pendingAttachRequest: model.composer.pendingAttachRequest
  };
}

export function sessionModelWithUiState(model: SessionInstanceModel, ui: SessionUiState): SessionInstanceModel {
  return {
    ...model,
    composer: {
      ...model.composer,
      input: ui.chatInput,
      attachments: ui.chatAttachments,
      selectedModel: ui.selectedModel,
      pendingInitialRequest: ui.pendingInitialRequest,
      pendingAttachRequest: ui.pendingAttachRequest
    },
    capabilities: {
      ...model.capabilities,
      availableSkills: ui.availableSkills
    },
    connection: {
      ...model.connection,
      skillListRequested: ui.skillListRequested
    },
    history: {
      ...model.history,
      messages: ui.chatMessages,
      turns: ui.turnFlows
    },
    runtime: {
      ...model.runtime,
      agentRunning: ui.agentRunning,
      compactRunning: ui.compactRunning,
      cotWork: ui.cotWork,
      requestQueue: ui.requestQueue,
      requestQueueCollapsed: ui.requestQueueCollapsed,
      contextUsage: ui.reportedContextUsage,
      notice: ui.notice,
      error: ui.sessionError
    },
    sidebar: {
      ...model.sidebar,
      open: ui.rightSidebarOpen,
      items: ui.rightSidebarItems,
      width: ui.rightSidebarWidth,
      scrollTop: ui.rightSidebarScrollTop
    },
    viewport: {
      ...model.viewport,
      autoScrollEnabled: ui.autoScrollEnabled,
      chatScrollTop: ui.chatScrollTop
    },
    subsessions: ui.subsessions
  };
}
