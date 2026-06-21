import React from "react";
import type { NDXAgentWebChatSession, NDXAgentWebMetadataResponse, NDXAgentWebSession, NDXWebClientStateDocument } from "ndx/webclient/common";
import {
  appendChatSessionMessageStream,
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
  createChatSession,
  createChatSessionModel,
  createSessionUiState,
  DEFAULT_MODEL,
  ensureChatModel,
  getChatSurfaceModelStore,
  getWebClientSessionSurfaceModel,
  listChatSessionData,
  setChatModelSelectedModel,
  toModelConfig,
  type ChatModelSnapshot,
  type SelectedModelConfig,
  type SessionUiState,
  type SocketState,
  updateChatModel
} from "ndx/webclient/front";
import type { WebClientBridge } from "../../app/bridge/WebClientBridge";
import { useBridgeModals, useBridgePendingActions, useBridgeProjectSessionDeleteRequest, useBridgeProjectSessions, useBridgeSurface } from "../../app/bridge/WebClientBridge";
import { RSC } from "../../app/resource";
import { sendProjectSessionDelete } from "../../menu/project/socket/projectSocket";
import { ModalPortal } from "../../modal/ModalLayer";
import { SessionSurfaces } from "../components/SessionSurfaces";
import { VibeLanding } from "../components/VibeLanding";
import { ChatSurface } from "../../chat/surface/ChatSurface";
import { SettingsSurface } from "../../settings/SettingsSurface";
import { useAskUserQuestionController } from "../askUserQuestion";
import { useSessionRequestController } from "../hooks/useSessionRequestController";
import { useSessionRenameController } from "../hooks/useSessionRenameController";
import { useSessionSocketController } from "../hooks/useSessionSocketController";
import { useSessionUiController } from "../hooks/useSessionUiController";
import { useModelDialogController } from "../modals/useModelDialogController";
import type { SessionSocketClient } from "../socket/sessionSocket";
import { useModel } from "../../model/useModel";

const SESSION_REWRITE_STORAGE_KEY = "ndx.session.rewrite.enabled";

type MainSurfaceProps = {
  bridge: WebClientBridge;
  clientid: string;
  clientState: NDXWebClientStateDocument;
  metadata: Partial<NDXAgentWebMetadataResponse>;
  notice: string;
  onOpenMenu: () => void;
  saveState: (nextState: NDXWebClientStateDocument) => void;
  sessionError: string;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
  setSessionError: React.Dispatch<React.SetStateAction<string>>;
  setStateSynced: React.Dispatch<React.SetStateAction<boolean>>;
  stateRef: React.MutableRefObject<NDXWebClientStateDocument>;
  t: Record<string, string>;
};

export function MainSurface({
  bridge,
  clientid,
  clientState,
  metadata,
  notice,
  onOpenMenu,
  saveState,
  sessionError,
  setNotice,
  setSessionError,
  setStateSynced,
  stateRef,
  t
}: MainSurfaceProps) {
  const surface = useBridgeSurface(bridge);
  const modalRequests = useBridgeModals(bridge);
  const deleteSessionRequest = useBridgeProjectSessionDeleteRequest(bridge);
  const pendingActions = useBridgePendingActions(bridge);
  const sessionsByProject = useBridgeProjectSessions(bridge);
  const pendingActionsRef = React.useRef<Set<string>>(pendingActions);
  const sessionSurface = getWebClientSessionSurfaceModel(loadRewriteEnabledBySession());
  const socketState = useModel(sessionSurface.socketState).value;
  const attachedSessionIds = useModel(sessionSurface.attachedSessionIds).value;
  const chatStore = useModel(getChatSurfaceModelStore());
  const chatModelByKey = chatStore.snapshot;
  const setChatModelByKey = (update: ChatModelSnapshot | ((current: ChatModelSnapshot) => ChatModelSnapshot)) => chatStore.setSnapshot(update);
  const rewriteEnabledBySession = useModel(sessionSurface.rewriteEnabledBySession).value;
  const setSocketState = (update: React.SetStateAction<SocketState>) => sessionSurface.socketState.set(update);
  const setAttachedSessionIds = (update: React.SetStateAction<Set<string>>) => sessionSurface.attachedSessionIds.set(update);
  const socketRef = React.useRef<SessionSocketClient | null>(null);
  const attachedSessionIdsRef = React.useRef<Set<string>>(new Set());
  const sessionUi = useSessionUiController();
  const {
    activeSessionId,
    activeSessionIdRef,
    activeUi,
    activeUiKey,
    activeUiKeyRef,
    addChatAttachments,
    chatAttachments,
    chatInput,
    clearChatAttachments,
    draftSessionProjectId,
    draftSessionProjectIdRef,
    removeChatAttachment,
    selectedModel,
    sessionUiByKey,
    sessionUiManagerRef,
    setActiveSessionError,
    setActiveSessionId,
    setAgentRunning,
    setAutoScrollEnabled,
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
    applyRoutedSessionMessage,
    updateActiveUi,
    updateSessionUi,
    upsertSessionModel
  } = sessionUi;
  const activeProject = clientState.projects.find((item) => item.projectName === clientState.activeProjectName);
  const draftProject = clientState.projects.find((item) => item.projectName === draftSessionProjectId);
  const projectApi = bridge.getProjectApi();
  const activeSession = Object.values(sessionsByProject).flat().find((session) => session.sessionid === activeSessionId);
  const applySkillList = React.useCallback((skills: SessionUiState["availableSkills"]) => {
    updateActiveUi((current) => ({ ...current, availableSkills: skills }));
  }, [updateActiveUi]);
  const agentRunning = Boolean(activeUi?.agentRunning);
  const rewriteEnabled = activeSessionId ? Boolean(rewriteEnabledBySession[activeSessionId]) : false;
  const modelDialog = useModelDialogController({ activeSession, selectedModel, setSelectedModel, setNotice, t });
  const askUserQuestion = useAskUserQuestionController({ getSocket: () => socketRef.current, t });
  const chatSurfaceKey = surface.kind === "chat-draft"
    ? chatDraftModelKey(surface.folderId)
    : surface.kind === "chat-session"
      ? chatSessionModelKey(surface.sessionId)
      : surface.kind === "chat-folder"
        ? chatFolderModelKey(surface.folderId)
        : undefined;
  const chatModel = chatSurfaceKey ? chatModelByKey[chatSurfaceKey] : undefined;
  const chatUi = chatModel ? chatModelToUiState(chatModel) : createSessionUiState();
  const chatSession = chatModel?.metadata;
  const chatSelectedModel = chatModel?.composer.selectedModel ?? DEFAULT_MODEL;
  const setChatSelectedModel = (update: SelectedModelConfig | ((current: SelectedModelConfig) => SelectedModelConfig)) => {
    if (!chatSurfaceKey) return;
    setChatModelByKey((current) => {
      const ensured = ensureChatModel(current, chatSurfaceKey);
      const model = ensured[chatSurfaceKey];
      if (!model) return ensured;
      const nextModel = typeof update === "function" ? update(model.composer.selectedModel) : update;
      return { ...ensured, [chatSurfaceKey]: setChatModelSelectedModel(model, nextModel) };
    });
  };
  const updateChatUi = (key: string, update: (current: SessionUiState) => SessionUiState) => {
    setChatModelByKey((current) => {
      const ensured = ensureChatModel(current, key);
      const model = ensured[key];
      return model ? { ...ensured, [key]: chatModelWithUiState(model, update(chatModelToUiState(model))) } : ensured;
    });
  };
  const hasPendingAction = (key: string) => pendingActions.has(key);
  const startAction = (key: string) => bridge.startAction(key);
  const finishAction = (key: string) => bridge.finishAction(key);
  const sessionRename = useSessionRenameController({
    finishAction,
    getSocket: () => socketRef.current?.socket,
    hasPendingAction,
    setNotice,
    setProjectWarning: (message) => projectApi?.setProjectWarning(message),
    setProjectWarningTitle: (message) => projectApi?.setProjectWarningTitle(message),
    setSessionsByProject: (update) => projectApi?.setSessionsByProject(update),
    setStateSynced,
    startAction,
    stateRef,
    t
  });
  const clearSessionError = () => {
    setSessionError("");
    setActiveSessionError("");
  };
  const sessionSocket = useSessionSocketController({
    activeSession,
    activeSessionId,
    activeSessionIdRef,
    activeUi,
    activeUiKeyRef,
    clientid,
    clearSessionError,
    draftSessionProjectId,
    draftSessionProjectIdRef,
    finishAction,
    metadata,
    pendingActionsRef,
    project: {
      applySessionDeleted: (message) => bridge.getProjectApi()?.applySessionDeleted(message),
      reloadChangedSessionList: (message) => bridge.getProjectApi()?.reloadChangedSessionList(message),
      refreshSessions: () => bridge.getProjectApi()?.refreshSessions() ?? Promise.resolve(),
      openProjectSession: (projectName, sessionid) => bridge.openProjectSession(projectName, sessionid),
      setSessionsByProject: (update) => bridge.getProjectApi()?.setSessionsByProject(update)
    },
    saveState,
    sessionRename,
    onClientRequest: askUserQuestion.onClientRequest,
    onClientRequestClosed: askUserQuestion.onClientRequestClosed,
    attachedSessionIdsRef,
    sessionUiManagerRef,
    setActiveSessionError,
    setActiveSessionId,
    setAgentRunning,
    setDraftSessionProjectId,
    setLastProtocolEvent: () => undefined,
    setNotice,
    setPendingActions: (next) => bridge.setPendingActions(next),
    setSessionNotice,
    setAttachedSessionIds,
    setSessionUiByKey,
    setSocketState,
    setTurnFlows,
    socketRef,
    socketState,
    stateRef,
    t,
    onSkillListReceived: applySkillList,
    applyRoutedSessionMessage,
    updateActiveUi,
    updateSessionUi,
    upsertSessionModel
  });
  const sessionRequest = useSessionRequestController({
    activeProject,
    activeSession,
    activeSessionId,
    activeUiKey,
    activeUiKeyRef,
    agentRunning,
    attachSession: sessionSocket.attachSession,
    chatAttachments,
    chatInput,
    clearChatAttachments,
    clearSessionError,
    draftProject,
    draftSessionProjectIdRef,
    finishAction,
    getSocket: () => socketRef.current,
    modelDialog,
    refreshSkillList: sessionSocket.refreshSkillList,
    rewriteEnabled,
    selectedModel,
    attachedSessionIdsRef,
    sessionUiManagerRef,
    sessionsByProject,
    setActiveSessionId,
    setAgentRunning,
    setAutoScrollEnabled,
    setChatAttachments,
    setChatInput,
    setDraftSessionProjectId,
    setSessionNotice,
    setSessionUiByKey,
    setSessionsByProject: (update) => bridge.getProjectApi()?.setSessionsByProject(update),
    socketState,
    startAction,
    t,
    updateActiveUi,
    updateSessionUi
  });
  const toggleSessionRewrite = (sessionid: string) => {
    saveRewriteEnabledBySession(sessionSurface.toggleRewrite(sessionid));
  };
  const mutateUserTurnAvailable = (sessionid: string) => {
    const ui = sessionUiByKey[sessionid];
    const session = Object.values(sessionsByProject).flat().find((item) => item.sessionid === sessionid);
    return Boolean(session && !session.isrunning && !ui?.agentRunning && !ui?.compactRunning);
  };
  const deleteUserTurn = (sessionid: string, inputDataId: string) => {
    if (!mutateUserTurnAvailable(sessionid)) return;
    const actionKey = `session-turn-delete:${sessionid}:${inputDataId}`;
    if (!startAction(actionKey)) return;
    if (sessionSocket.deleteTurn(sessionid, inputDataId)) {
      updateSessionUi(sessionid, (current) => ({ ...current, notice: "세션 턴 삭제 중..." }));
      return;
    }
    finishAction(actionKey);
    updateSessionUi(sessionid, (current) => ({ ...current, notice: t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT] }));
  };
  const createTurnBranch = (sessionid: string, inputDataId: string) => {
    if (!mutateUserTurnAvailable(sessionid)) return;
    const actionKey = `session-branch:${sessionid}:${inputDataId}`;
    if (!startAction(actionKey)) return;
    if (sessionSocket.createBranch(sessionid, inputDataId)) {
      updateSessionUi(sessionid, (current) => ({ ...current, notice: "세션 분기 생성 중..." }));
      return;
    }
    finishAction(actionKey);
    updateSessionUi(sessionid, (current) => ({ ...current, notice: t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT] }));
  };
  const deleteQueuedRequest = (sessionid: string, itemid: string) => {
    if (socketRef.current?.deleteQueuedRequest(sessionid, itemid)) return;
    updateSessionUi(sessionid, (current) => ({ ...current, notice: t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT] }));
  };
  const updateQueuedRequest = (sessionid: string, itemid: string, text: string) => {
    if (socketRef.current?.updateQueuedRequest(sessionid, itemid, text)) return;
    updateSessionUi(sessionid, (current) => ({ ...current, notice: t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT] }));
  };
  const toggleSubsession = (parentKey: string, sessionid: string, expanded: boolean) => {
    updateSessionUi(parentKey, (current) => ({
      ...current,
      subsessions: current.subsessions.map((item) => item.sessionid === sessionid ? { ...item, expanded } : item)
    }));
    if (!expanded) return;
    const parentSession = Object.values(sessionsByProject).flat().find((item) => item.sessionid === parentKey);
    if (parentSession) {
      socketRef.current?.attachSession({ projectName: parentSession.projectname, sessionid });
    }
    socketRef.current?.requestHistorySummary(sessionid);
  };

  React.useEffect(() => {
    attachedSessionIdsRef.current = attachedSessionIds;
  }, [attachedSessionIds]);

  React.useEffect(() => {
    pendingActionsRef.current = pendingActions;
  }, [pendingActions]);

  React.useEffect(() => {
    if (!deleteSessionRequest) return;
    clearSessionError();
    const { project, session } = deleteSessionRequest;
    const nextAttached = new Set(attachedSessionIdsRef.current);
    nextAttached.delete(session.sessionid);
    attachedSessionIdsRef.current = nextAttached;
    setAttachedSessionIds(nextAttached);
    if (!sendProjectSessionDelete(socketRef.current?.socket, { projectName: project.projectName, sessionid: session.sessionid })) {
      finishAction(`session-delete:${session.sessionid}`);
      setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
    }
  }, [deleteSessionRequest?.revision]);

  React.useEffect(() => {
    if (surface.kind === "empty" || surface.kind === "project" || surface.kind === "settings") {
      activeSessionIdRef.current = undefined;
      activeUiKeyRef.current = undefined;
      draftSessionProjectIdRef.current = undefined;
      setActiveSessionId(undefined);
      setDraftSessionProjectId(undefined);
      setAgentRunning(false);
      setChatMessages([]);
      setTurnFlows([]);
      setCotWork(undefined);
      setReportedContextUsage(undefined);
      return;
    }
    if (surface.kind === "project-session") {
      const session = Object.values(sessionsByProject).flat().find((item) => item.sessionid === surface.sessionId);
      if (session) {
        upsertSessionModel(session);
      }
      activeSessionIdRef.current = surface.sessionId;
      activeUiKeyRef.current = surface.sessionId;
      draftSessionProjectIdRef.current = undefined;
      setActiveSessionId(surface.sessionId);
      setDraftSessionProjectId(undefined);
      updateSessionUi(surface.sessionId, (current) => ({
        ...current,
        agentRunning: session ? Boolean(session.isrunning) : current.agentRunning
      }));
      sessionSocket.refreshSkillList();
      return;
    }
    if (surface.kind === "project-draft") {
      const key = `draft:${surface.projectName}`;
      activeSessionIdRef.current = undefined;
      activeUiKeyRef.current = key;
      draftSessionProjectIdRef.current = surface.projectName;
      setActiveSessionId(undefined);
      setDraftSessionProjectId(surface.projectName);
      updateSessionUi(key, (current) => ({
        ...current,
        selectedModel: DEFAULT_MODEL,
        notice: t[RSC.SESSION_PAGE_NEW_DRAFT_READY_STATUS],
        sessionError: ""
      }));
      sessionSocket.refreshSkillList();
    }
    if (surface.kind === "chat-folder" || surface.kind === "chat-session" || surface.kind === "chat-draft") {
      activeSessionIdRef.current = undefined;
      activeUiKeyRef.current = surface.kind === "chat-draft" ? chatDraftModelKey(surface.folderId) : surface.kind === "chat-session" ? chatSessionModelKey(surface.sessionId) : undefined;
      draftSessionProjectIdRef.current = undefined;
      setActiveSessionId(undefined);
      setDraftSessionProjectId(undefined);
      setAgentRunning(false);
      setChatMessages([]);
      setTurnFlows([]);
      setCotWork(undefined);
      setReportedContextUsage(undefined);
      if (surface.kind === "chat-draft") {
        const key = chatDraftModelKey(surface.folderId);
        setChatModelByKey((current) => {
          const model = current[key] ?? createChatDraftModel(surface.folderId);
          return {
            ...current,
            [key]: {
              ...model,
              runtime: { ...model.runtime, notice: "모델을 선택하고 메시지를 입력하세요.", error: "" }
            }
          };
        });
      }
      if (surface.kind === "chat-session") {
        const key = chatSessionModelKey(surface.sessionId);
        updateChatUi(key, (current) => ({ ...current, notice: "채팅 세션을 불러왔습니다.", sessionError: "" }));
        void listChatSessionData(surface.sessionId).then((body) => {
          if (!body.chatSession) return;
          setChatModelByKey((current) => {
            const model = current[key] ?? createChatSessionModel(body.chatSession!);
            return { ...current, [key]: applyChatSessionLoaded(model, body.chatSession!, body.data) };
          });
        }).catch((error) => {
          updateChatUi(key, (current) => ({ ...current, sessionError: error instanceof Error ? error.message : "채팅 기록을 불러오지 못했습니다." }));
        });
      }
    }
  }, [surface.revision]);

  React.useEffect(() => {
    const modelRequest = [...modalRequests].reverse().find((request) => request.kind === "model");
    if (modelRequest?.kind === "model") {
      activeUiKeyRef.current = modelRequest.sourceSurfaceKey;
      modelDialog.setOpen(true);
      bridge.closeModal("model");
      return;
    }
    const renameRequest = [...modalRequests].reverse().find((request) => request.kind === "session-rename");
    if (renameRequest?.kind !== "session-rename") return;
    const projectRow = clientState.projects.find((item) => item.projectName === renameRequest.projectName);
    const sessionRow = (sessionsByProject[renameRequest.projectName] ?? []).find((item) => item.sessionid === renameRequest.sessionId);
    if (projectRow && sessionRow) {
      sessionRename.open(projectRow, sessionRow);
      bridge.closeModal("session-rename");
    }
  }, [modalRequests, clientState.projects, sessionsByProject]);

  if (surface.kind === "settings") {
    return <SettingsSurface menuLabel={t[RSC.APP_SHELL_MENU_OPEN_BUTTON]} onOpenMenu={onOpenMenu} />;
  }

  if (surface.kind === "chat-folder" || surface.kind === "chat-session" || surface.kind === "chat-draft") {
    const key = chatSurfaceKey ?? "chat";
    const surfaceHasComposer = surface.kind === "chat-draft" || surface.kind === "chat-session";
    const chatSubmitActionKey = `chat-submit:${key}`;
    const chatRequestPending = chatUi.agentRunning || pendingActions.has(chatSubmitActionKey);
    const title = surface.kind === "chat-draft" ? "새 채팅" : surface.kind === "chat-session" ? (chatSession?.title || "채팅 세션") : "채팅 폴더";
    const submitChat = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = chatUi.chatInput.trim();
      if (!surfaceHasComposer || !text) return;
      if (chatRequestPending || !startAction(chatSubmitActionKey)) return;
      if (!chatSelectedModel.model.trim()) {
        finishAction(chatSubmitActionKey);
        updateChatUi(key, (current) => ({ ...current, notice: "모델을 먼저 선택하세요." }));
        return;
      }
      setChatModelByKey((current) => {
        const model = current[key] ?? (surface.kind === "chat-draft" ? createChatDraftModel(surface.folderId) : createChatFolderModel(""));
        return { ...current, [key]: applyChatRequestStarted(model, text) };
      });
      let requestUiKey = key;
      void (async () => {
        const model = toModelConfig(chatSelectedModel);
        const session: Pick<NDXAgentWebChatSession, "chatsessionid"> & Partial<NDXAgentWebChatSession> = surface.kind === "chat-draft"
          ? await createChatSession(surface.folderId, { model, title: text.slice(0, 80) })
          : { chatsessionid: surface.sessionId };
        const nextKey = chatSessionModelKey(session.chatsessionid);
        requestUiKey = nextKey;
        setChatModelByKey((current) => {
          const source = current[key] ?? (surface.kind === "chat-draft" ? createChatDraftModel(surface.folderId) : createChatFolderModel(""));
          const next = { ...current, [key]: { ...source, runtime: { ...source.runtime, agentRunning: true } } };
          next[nextKey] = {
            ...source,
            key: nextKey,
            identity: "folderid" in session && session.folderid
              ? { kind: "session", key: nextKey, sessionId: session.chatsessionid, folderId: session.folderid }
              : { kind: "session", key: nextKey, sessionId: session.chatsessionid },
            metadata: "folderid" in session && session.folderid ? session as NDXAgentWebChatSession : source.metadata,
            composer: { ...source.composer, input: "", selectedModel: chatSelectedModel },
            runtime: { agentRunning: true, notice: "응답 생성 중...", error: "" }
          };
          return next;
        });
        if (surface.kind === "chat-draft") {
          bridge.openChatSession(surface.folderId, session.chatsessionid);
        }
        window.dispatchEvent(new Event("ndx-chat-refresh"));
        const body = await appendChatSessionMessageStream(session.chatsessionid, { text, model }, (streamEvent) => {
          if (streamEvent.kind === "assistant_delta") {
            if (!streamEvent.text.trim()) return;
            setChatModelByKey((current) => updateChatModel(current, nextKey, applyChatStreamProgress));
          }
        });
        setChatModelByKey((current) => {
          const source = current[nextKey] ?? current[key] ?? createChatSessionModel(body.session);
          return { ...current, [nextKey]: applyChatRequestCompleted(source, body.session, body.data) };
        });
        window.dispatchEvent(new Event("ndx-chat-refresh"));
        finishAction(chatSubmitActionKey);
      })().catch((error) => {
        finishAction(chatSubmitActionKey);
        setChatModelByKey((current) => updateChatModel(current, requestUiKey, (model) => applyChatRequestFailed(model, text, error instanceof Error ? error.message : "채팅 요청이 실패했습니다.")));
      });
    };
    return (
      <ChatSurface
        title={title}
        draft={surface.kind === "chat-draft"}
        ui={chatUi}
        selectedModel={chatSelectedModel}
        requestPending={chatRequestPending}
        menuLabel={t[RSC.APP_SHELL_MENU_OPEN_BUTTON]}
        onOpenMenu={onOpenMenu}
        onInputChange={(value) => updateChatUi(key, (current) => ({ ...current, chatInput: value }))}
        onModelChange={setChatSelectedModel}
        onSubmit={submitChat}
      />
    );
  }

  if (surfaceKeys.length === 0) {
    return (
      <>
        <VibeLanding menuLabel={t[RSC.APP_SHELL_MENU_OPEN_BUTTON]} onOpenMenu={onOpenMenu} />
        <ModalPortal>
          {sessionRename.dialog}
          {modelDialog.dialog}
          {askUserQuestion.dialog}
        </ModalPortal>
      </>
    );
  }

  return (
    <>
      <SessionSurfaces activeUiKey={activeUiKey} clientState={clientState} hasPendingAction={hasPendingAction} notice={notice} rewriteEnabledBySession={rewriteEnabledBySession} sessionError={sessionError} sessionsByProject={sessionsByProject} sessionUiByKey={sessionUiByKey} surfaceKeys={surfaceKeys} t={t} updateSessionUi={updateSessionUi} onOpenMenu={onOpenMenu} onChatScroll={(key, scrollTop) => updateSessionUi(key, (current) => ({ ...current, chatScrollTop: scrollTop }))} onDisableAutoScroll={(key) => updateSessionUi(key, (current) => ({ ...current, autoScrollEnabled: false }))} onDismissError={(key) => updateSessionUi(key, (current) => ({ ...current, sessionError: "" }))} onChatInputChange={(key, value) => updateSessionUi(key, (current) => ({ ...current, chatInput: value }))} onAddAttachments={addChatAttachments} onAttachmentRejected={(key, message) => updateSessionUi(key, (current) => ({ ...current, notice: message }))} onRemoveAttachment={removeChatAttachment} onModelClick={(key) => { activeUiKeyRef.current = key; modelDialog.setOpen(true); }} onRewriteToggle={toggleSessionRewrite} onSkillListRefresh={sessionSocket.refreshSkillList} onQueueAdd={sessionRequest.queueChatRequest} onQueuedRequestDelete={deleteQueuedRequest} onQueuedRequestUpdate={updateQueuedRequest} onSubsessionToggle={toggleSubsession} onSubmit={sessionRequest.submitChatRequest} onUserMessageBranch={createTurnBranch} onUserMessageDelete={deleteUserTurn} onTurnToggle={sessionSocket.toggleTurnDetail} onIterationToggle={sessionSocket.toggleIterationDetail} />
      <ModalPortal>
        {sessionRename.dialog}
        {modelDialog.dialog}
        {askUserQuestion.dialog}
      </ModalPortal>
    </>
  );
}

function loadRewriteEnabledBySession(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SESSION_REWRITE_STORAGE_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, value]) => value === true).map(([key]) => [key, true]));
  } catch {
    return {};
  }
}

function saveRewriteEnabledBySession(value: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(SESSION_REWRITE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Local UI preference only.
  }
}
