import React from "react";
import {
  browserRandomId,
  createSessionUiState,
  DEFAULT_MODEL,
  getWebClientSessionModelStore,
  NDXWebClientSessionUiManager,
  type SessionAttachmentDraft
} from "ndx/webclient/front";
import { useModel } from "../../model/useModel";

export function useSessionUiController() {
  const store = useModel(getWebClientSessionModelStore());
  const activeSessionId = useModel(store.activeSessionId).value;
  const draftSessionProjectId = useModel(store.draftSessionProjectId).value;
  const activeSessionIdRef = React.useRef<string | undefined>(activeSessionId);
  const activeUiKeyRef = React.useRef<string | undefined>(undefined);
  const draftSessionProjectIdRef = React.useRef<string | undefined>(undefined);
  const sessionUiManagerRef = React.useRef(new NDXWebClientSessionUiManager(createSessionUiState));
  const activeUiKey = store.activeUiKey;
  const sessionUiByKey = store.sessionUiByKey();
  const activeUi = activeUiKey ? sessionUiByKey[activeUiKey] ?? createSessionUiState() : undefined;
  const chatInput = activeUi?.chatInput ?? "";
  const chatAttachments = activeUi?.chatAttachments ?? [];
  const selectedModel = activeUi?.selectedModel ?? DEFAULT_MODEL;
  const surfaceKeys = store.surfaceKeys();

  React.useEffect(() => {
    sessionUiManagerRef.current = new NDXWebClientSessionUiManager(createSessionUiState, sessionUiByKey);
    if (activeUiKey) {
      sessionUiManagerRef.current.setActiveSession(activeUiKey);
    }
  }, [activeUiKey, sessionUiByKey]);

  React.useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    activeUiKeyRef.current = activeUiKey;
    draftSessionProjectIdRef.current = draftSessionProjectId;
  }, [activeSessionId, activeUiKey, draftSessionProjectId]);

  React.useEffect(() => () => {
    for (const ui of Object.values(sessionUiManagerRef.current.snapshot)) {
      for (const attachment of ui.chatAttachments) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
    }
  }, []);

  const addChatAttachments = (files: File[]) => {
    if (files.length === 0) return;
    store.setChatAttachments((current) => [
      ...current,
      ...files.slice(0, Math.max(0, 8 - current.length)).map((file) => ({
        id: browserRandomId(),
        file,
        name: file.name || "clipboard-attachment",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        previewUrl: (file.type || "").toLowerCase().startsWith("image/") ? URL.createObjectURL(file) : undefined
      }))
    ]);
  };

  const removeChatAttachment = (id: string) => {
    store.setChatAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  };

  const clearChatAttachments = () => {
    store.setChatAttachments((current) => {
      for (const attachment of current) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
      return [];
    });
  };

  return {
    addChatAttachments,
    activeSessionId,
    activeSessionIdRef,
    activeUi,
    activeUiKey,
    activeUiKeyRef,
    chatAttachments,
    chatInput,
    clearChatAttachments,
    draftSessionProjectId,
    draftSessionProjectIdRef,
    selectedModel,
    sessionUiByKey,
    sessionUiManagerRef,
    setActiveSessionError: (message: string) => store.setActiveSessionError(message),
    setActiveSessionId: (update: React.SetStateAction<string | undefined>) => store.activeSessionId.set(update),
    setAgentRunning: (running: boolean) => store.setAgentRunning(running),
    setAutoScrollEnabled: (enabled: boolean) => store.setAutoScrollEnabled(enabled),
    setAvailableSkills: (skills: unknown[]) => store.updateActiveUi((current) => ({ ...current, availableSkills: skills as typeof current.availableSkills, skillListRequested: false })),
    setChatAttachments: (update: SessionAttachmentDraft[] | ((current: SessionAttachmentDraft[]) => SessionAttachmentDraft[])) => store.setChatAttachments(update),
    setChatInput: (value: string) => store.setChatInput(value),
    setChatMessages: store.setChatMessages.bind(store),
    setCotWork: store.setCotWork.bind(store),
    setDraftSessionProjectId: (update: React.SetStateAction<string | undefined>) => store.draftSessionProjectId.set(update),
    setReportedContextUsage: store.setReportedContextUsage.bind(store),
    setSelectedModel: store.setSelectedModel.bind(store),
    setSessionNotice: store.setSessionNotice.bind(store),
    setSessionUiByKey: store.setSessionUiByKey.bind(store),
    setTurnFlows: store.setTurnFlows.bind(store),
    surfaceKeys,
    removeChatAttachment,
    applyRoutedSessionMessage: store.applyRoutedSessionMessage.bind(store),
    updateActiveUi: store.updateActiveUi.bind(store),
    updateSessionUi: store.updateSessionUi.bind(store),
    upsertSessionModel: store.upsertSessionModel.bind(store)
  };
}
