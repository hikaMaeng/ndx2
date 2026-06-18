import React from "react";
import {
  createDraftSessionModel,
  createSessionIdentityFromRow,
  createSessionModelFromRow,
  createSessionUiState,
  DEFAULT_MODEL,
  NDXWebClientSessionUiManager,
  applyRoutedSessionMessageToStore,
  sessionModelToUiState,
  sessionModelWithUiState,
  type ChatMessage,
  type NDXAgentWebContextUsage,
  type ProtocolEventUiText,
  type SelectedModelConfig,
  type SessionAttachmentDraft,
  type SessionInstanceModel,
  type SessionModelRoutedMessage,
  type SessionModelSnapshot,
  type SessionUiState,
  type TurnFlowState
} from "ndx/webclient/front";
import type { NDXCotWorkContents } from "ndx/common/protocol";
import type { NDXAgentWebSession } from "ndx/webclient/common";
export function useSessionUiController() {
  const [sessionModelByKey, setSessionModelByKey] = React.useState<SessionModelSnapshot>({});
  const [activeSessionId, setActiveSessionId] = React.useState<string>();
  const [draftSessionProjectId, setDraftSessionProjectId] = React.useState<string>();
  const sessionUiManagerRef = React.useRef(new NDXWebClientSessionUiManager(createSessionUiState));
  const activeSessionIdRef = React.useRef<string | undefined>(activeSessionId);
  const activeUiKeyRef = React.useRef<string | undefined>(undefined);
  const draftSessionProjectIdRef = React.useRef<string | undefined>(undefined);
  const draftUiKey = draftSessionProjectId ? `draft:${draftSessionProjectId}` : undefined;
  const activeUiKey = activeSessionId ?? draftUiKey;
  const sessionUiByKey = React.useMemo(() => sessionUiSnapshot(sessionModelByKey), [sessionModelByKey]);
  const activeUi = activeUiKey ? sessionUiByKey[activeUiKey] ?? createSessionUiState() : undefined;
  const chatInput = activeUi?.chatInput ?? "";
  const chatAttachments = activeUi?.chatAttachments ?? [];
  const selectedModel = activeUi?.selectedModel ?? DEFAULT_MODEL;
  const surfaceKeys = [...new Set([...Object.keys(sessionUiByKey), ...(activeUiKey ? [activeUiKey] : [])])];

  React.useEffect(() => {
    sessionUiManagerRef.current = new NDXWebClientSessionUiManager(createSessionUiState, sessionUiByKey);
    if (activeUiKey) {
      sessionUiManagerRef.current.setActiveSession(activeUiKey);
    }
  }, [activeUiKey, sessionModelByKey, sessionUiByKey]);

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

  const setSessionUiByKey: React.Dispatch<React.SetStateAction<Record<string, SessionUiState>>> = (update) => {
    setSessionModelByKey((current) => {
      const currentUi = sessionUiSnapshot(current);
      const nextUi = typeof update === "function" ? update(currentUi) : update;
      const next: SessionModelSnapshot = {};
      for (const [key, ui] of Object.entries(nextUi)) {
        next[key] = sessionModelWithUiState(current[key] ?? modelForUiKey(key), ui);
      }
      return next;
    });
  };

  const updateSessionUi = (key: string, update: (current: SessionUiState) => SessionUiState) => {
    setSessionModelByKey((current) => {
      const model = current[key] ?? modelForUiKey(key);
      return {
        ...current,
        [key]: sessionModelWithUiState(model, update(sessionModelToUiState(model)))
      };
    });
  };

  const updateActiveUi = (update: (current: SessionUiState) => SessionUiState) => {
    const key = activeUiKeyRef.current;
    if (!key) return;
    updateSessionUi(key, update);
  };
  const applyRoutedSessionMessage = (message: SessionModelRoutedMessage, text: ProtocolEventUiText) => {
    setSessionModelByKey((current) => applyRoutedSessionMessageToStore(current, message, text));
  };

  const setChatInput = (value: string) => updateActiveUi((current) => ({ ...current, chatInput: value }));
  const setChatAttachments = (update: SessionAttachmentDraft[] | ((current: SessionAttachmentDraft[]) => SessionAttachmentDraft[])) => updateActiveUi((current) => ({
    ...current,
    chatAttachments: typeof update === "function" ? update(current.chatAttachments) : update
  }));
  const setSelectedModel = (update: SelectedModelConfig | ((current: SelectedModelConfig) => SelectedModelConfig)) => updateActiveUi((current) => ({
    ...current,
    selectedModel: typeof update === "function" ? update(current.selectedModel) : update
  }));
  const setAvailableSkills = (skills: unknown[]) => updateActiveUi((current) => ({ ...current, availableSkills: skills as SessionUiState["availableSkills"] }));
  const setAgentRunning = (running: boolean) => updateActiveUi((current) => ({ ...current, agentRunning: running }));
  const setChatMessages = (update: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) => updateActiveUi((current) => ({
    ...current,
    chatMessages: typeof update === "function" ? update(current.chatMessages) : update
  }));
  const setTurnFlows = (update: TurnFlowState[] | ((current: TurnFlowState[]) => TurnFlowState[])) => updateActiveUi((current) => ({
    ...current,
    turnFlows: typeof update === "function" ? update(current.turnFlows) : update
  }));
  const setCotWork = (work: NDXCotWorkContents | undefined) => updateActiveUi((current) => ({ ...current, cotWork: work }));
  const setAutoScrollEnabled = (enabled: boolean) => updateActiveUi((current) => ({ ...current, autoScrollEnabled: enabled }));
  const setReportedContextUsage = (update: NDXAgentWebContextUsage | undefined | ((current?: NDXAgentWebContextUsage) => NDXAgentWebContextUsage | undefined)) => updateActiveUi((current) => ({
    ...current,
    reportedContextUsage: typeof update === "function" ? update(current.reportedContextUsage) : update
  }));
  const setSessionNotice = (message: string) => updateActiveUi((current) => ({ ...current, notice: message }));
  const setActiveSessionError = (message: string) => updateActiveUi((current) => ({ ...current, sessionError: message }));
  const addChatAttachments = (files: File[]) => {
    if (files.length === 0) return;
    setChatAttachments((current) => [
      ...current,
      ...files.slice(0, Math.max(0, 8 - current.length)).map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name || "clipboard-attachment",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        previewUrl: (file.type || "").toLowerCase().startsWith("image/") ? URL.createObjectURL(file) : undefined
      }))
    ]);
  };
  const removeChatAttachment = (id: string) => {
    setChatAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  };
  const clearChatAttachments = () => {
    setChatAttachments((current) => {
      for (const attachment of current) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
      return [];
    });
  };
  const upsertSessionModel = (session: NDXAgentWebSession) => {
    setSessionModelByKey((current) => {
      const existing = current[session.sessionid];
      const next = existing
        ? {
          ...existing,
          key: session.sessionid,
          identity: createSessionIdentityFromRow(session),
          metadata: session,
          runtime: {
            ...existing.runtime,
            agentRunning: Boolean(session.isrunning)
          }
        }
        : createSessionModelFromRow(session);
      return { ...current, [session.sessionid]: next };
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
    setActiveSessionError,
    setActiveSessionId,
    setAgentRunning,
    setAutoScrollEnabled,
    setAvailableSkills,
    setChatAttachments,
    setChatInput,
    setChatMessages,
    setCotWork,
    setDraftSessionProjectId,
    setReportedContextUsage,
    setSelectedModel,
    setSessionNotice,
    setSessionUiByKey,
    setTurnFlows,
    surfaceKeys,
    removeChatAttachment,
    applyRoutedSessionMessage,
    updateActiveUi,
    updateSessionUi,
    upsertSessionModel
  };
}

function sessionUiSnapshot(snapshot: SessionModelSnapshot): Record<string, SessionUiState> {
  return Object.fromEntries(Object.entries(snapshot).map(([key, model]) => [key, sessionModelToUiState(model)]));
}

function modelForUiKey(key: string): SessionInstanceModel {
  if (key.startsWith("draft:")) {
    return createDraftSessionModel(key.slice("draft:".length));
  }
  const placeholder = createDraftSessionModel("");
  return {
    ...sessionModelWithUiState(placeholder, createSessionUiState()),
    key,
    identity: {
      kind: "session",
      key,
      sessionid: key,
      userid: "",
      projectName: ""
    }
  };
}
