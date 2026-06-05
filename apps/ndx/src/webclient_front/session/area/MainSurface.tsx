import React from "react";
import type { NDXSessionSkillSummary } from "ndx/common/protocol";
import type { NDXAgentWebChatSession, NDXAgentWebMetadataResponse, NDXAgentWebSession, NDXWebClientStateDocument, NDXAgentWebSessionData } from "ndx/webclient/common";
import { appendChatSessionMessageStream, createChatSession, createSessionUiState, DEFAULT_MODEL, fromModelConfig, listChatSessionData, sessionDataContentsText, sessionDataToChatMessage, sessionDataToVisibleChatMessage, toModelConfig, type ChatMessage, type SelectedModelConfig, type SessionUiState, type SocketState } from "ndx/webclient/front";
import type { WebClientBridge } from "../../app/bridge/WebClientBridge";
import { useBridgeModals, useBridgePendingActions, useBridgeProjectSessionDeleteRequest, useBridgeProjectSessions, useBridgeSurface } from "../../app/bridge/WebClientBridge";
import { RSC } from "../../app/resource";
import { sendProjectSessionDelete } from "../../menu/project/socket/projectSocket";
import { ModalPortal } from "../../modal/ModalLayer";
import { SessionSurfaces } from "../components/SessionSurfaces";
import { VibeLanding } from "../components/VibeLanding";
import { ChatSurface } from "../../chat/surface/ChatSurface";
import { useAskUserQuestionController } from "../askUserQuestion";
import { useSessionRequestController } from "../hooks/useSessionRequestController";
import { useSessionRenameController } from "../hooks/useSessionRenameController";
import { useSessionSocketController } from "../hooks/useSessionSocketController";
import { useSessionUiController } from "../hooks/useSessionUiController";
import { useModelDialogController } from "../modals/useModelDialogController";
import type { SessionSocketClient } from "../socket/sessionSocket";

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
  const [socketState, setSocketState] = React.useState<SocketState>("idle");
  const [attachedSessionIds, setAttachedSessionIds] = React.useState<Set<string>>(new Set());
  const [skillsByProject, setSkillsByProject] = React.useState<Record<string, NDXSessionSkillSummary[]>>({});
  const skillsByProjectRef = React.useRef<Record<string, NDXSessionSkillSummary[]>>({});
  const [chatUiByKey, setChatUiByKey] = React.useState<Record<string, SessionUiState>>({});
  const [chatSessionByKey, setChatSessionByKey] = React.useState<Record<string, NDXAgentWebChatSession>>({});
  const [chatSelectedModelByKey, setChatSelectedModelByKey] = React.useState<Record<string, SelectedModelConfig>>({});
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
    updateActiveUi,
    updateSessionUi
  } = sessionUi;
  const activeProject = clientState.projects.find((item) => item.projectName === clientState.activeProjectName);
  const draftProject = clientState.projects.find((item) => item.projectName === draftSessionProjectId);
  const projectApi = bridge.getProjectApi();
  const activeSession = Object.values(sessionsByProject).flat().find((session) => session.sessionid === activeSessionId);
  const applySkillList = React.useCallback((projectName: string, skills: NDXSessionSkillSummary[]) => {
    const sessionIds = new Set((sessionsByProject[projectName] ?? []).map((session) => session.sessionid));
    if (activeSession?.projectname === projectName) {
      sessionIds.add(activeSession.sessionid);
    }
    setSkillsByProject((current) => ({ ...current, [projectName]: skills }));
    setSessionUiByKey((current) => {
      let changed = false;
      const next = { ...current };
      for (const [key, ui] of Object.entries(current)) {
        if (key === `draft:${projectName}` || sessionIds.has(key)) {
          next[key] = { ...ui, availableSkills: skills };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [activeSession?.projectname, activeSession?.sessionid, sessionsByProject]);
  const agentRunning = Boolean(activeUi?.agentRunning);
  const modelDialog = useModelDialogController({ activeSession, selectedModel, setSelectedModel, setNotice, t });
  const askUserQuestion = useAskUserQuestionController({ getSocket: () => socketRef.current, t });
  const chatSurfaceKey = surface.kind === "chat-draft"
    ? `chat-draft:${surface.folderId}`
    : surface.kind === "chat-session"
      ? `chat:${surface.sessionId}`
      : surface.kind === "chat-folder"
        ? `chat-folder:${surface.folderId}`
        : undefined;
  const chatUi = chatSurfaceKey ? chatUiByKey[chatSurfaceKey] ?? createSessionUiState() : createSessionUiState();
  const chatSession = chatSurfaceKey ? chatSessionByKey[chatSurfaceKey] : undefined;
  const chatSelectedModel = chatSurfaceKey ? chatSelectedModelByKey[chatSurfaceKey] ?? DEFAULT_MODEL : DEFAULT_MODEL;
  const setChatSelectedModel = (update: SelectedModelConfig | ((current: SelectedModelConfig) => SelectedModelConfig)) => {
    if (!chatSurfaceKey) return;
    setChatSelectedModelByKey((current) => ({
      ...current,
      [chatSurfaceKey]: typeof update === "function" ? update(current[chatSurfaceKey] ?? DEFAULT_MODEL) : update
    }));
  };
  const updateChatUi = (key: string, update: (current: SessionUiState) => SessionUiState) => {
    setChatUiByKey((current) => ({ ...current, [key]: update(current[key] ?? createSessionUiState()) }));
  };
  const chatRowsToMessages = (rows: NDXAgentWebSessionData[]): ChatMessage[] => rows.flatMap((row) => {
    if (row.type === "user") return [sessionDataToChatMessage(row)];
    if (!row.contents || typeof row.contents !== "object") {
      const visible = sessionDataToVisibleChatMessage(row);
      return visible ? [visible] : [];
    }
    const kind = (row.contents as { kind?: unknown }).kind;
    if (kind === "assistant_message" || kind === "error") {
      const visible = sessionDataToVisibleChatMessage(row);
      return visible ? [visible] : [];
    }
    if (kind === "assistant_reasoning") {
      const text = sessionDataContentsText(row.contents);
      return text ? [{ id: row.dataid, role: "assistant", text, attachments: [] }] : [];
    }
    if (kind === "assistant_delta") {
      const text = sessionDataContentsText(row.contents);
      return text ? [{ id: row.dataid, role: "assistant", text, attachments: [] }] : [];
    }
    return [];
  });
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
    setChatMessages,
    setCotWork,
    setDraftSessionProjectId,
    setLastProtocolEvent: () => undefined,
    setNotice,
    setPendingActions: (next) => bridge.setPendingActions(next),
    setReportedContextUsage,
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
    updateActiveUi,
    updateSessionUi
  });
  const sessionRequest = useSessionRequestController({
    activeProject,
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
    selectedModel,
    attachedSessionIdsRef,
    sessionUiManagerRef,
    sessionsByProject,
    setActiveSessionError,
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

  React.useEffect(() => {
    attachedSessionIdsRef.current = attachedSessionIds;
  }, [attachedSessionIds]);

  React.useEffect(() => {
    skillsByProjectRef.current = skillsByProject;
  }, [skillsByProject]);

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
    if (!sendProjectSessionDelete(socketRef.current?.socket, { userid: session.userid, projectName: project.projectName, sessionid: session.sessionid })) {
      finishAction(`session-delete:${session.sessionid}`);
      setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
    }
  }, [deleteSessionRequest?.revision]);

  React.useEffect(() => {
    if (surface.kind === "empty" || surface.kind === "project") {
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
      const cachedSkills = session ? skillsByProjectRef.current[session.projectname] : undefined;
      activeSessionIdRef.current = surface.sessionId;
      activeUiKeyRef.current = surface.sessionId;
      draftSessionProjectIdRef.current = undefined;
      setActiveSessionId(surface.sessionId);
      setDraftSessionProjectId(undefined);
      updateSessionUi(surface.sessionId, (current) => ({
        ...current,
        ...(cachedSkills ? { availableSkills: cachedSkills } : {}),
        agentRunning: current.chatMessages.length === 0 && current.turnFlows.length === 0 ? Boolean(session?.isrunning) : current.agentRunning
      }));
      sessionSocket.refreshSkillList();
      return;
    }
    if (surface.kind === "project-draft") {
      const key = `draft:${surface.projectName}`;
      const cachedSkills = skillsByProjectRef.current[surface.projectName];
      activeSessionIdRef.current = undefined;
      activeUiKeyRef.current = key;
      draftSessionProjectIdRef.current = surface.projectName;
      setActiveSessionId(undefined);
      setDraftSessionProjectId(surface.projectName);
      updateSessionUi(key, (current) => ({
        ...current,
        ...(cachedSkills ? { availableSkills: cachedSkills } : {}),
        selectedModel: DEFAULT_MODEL,
        notice: t[RSC.SESSION_PAGE_NEW_DRAFT_READY_STATUS],
        sessionError: ""
      }));
      sessionSocket.refreshSkillList();
    }
    if (surface.kind === "chat-folder" || surface.kind === "chat-session" || surface.kind === "chat-draft") {
      activeSessionIdRef.current = undefined;
      activeUiKeyRef.current = surface.kind === "chat-draft" ? `chat-draft:${surface.folderId}` : surface.kind === "chat-session" ? `chat:${surface.sessionId}` : undefined;
      draftSessionProjectIdRef.current = undefined;
      setActiveSessionId(undefined);
      setDraftSessionProjectId(undefined);
      setAgentRunning(false);
      setChatMessages([]);
      setTurnFlows([]);
      setCotWork(undefined);
      setReportedContextUsage(undefined);
      if (surface.kind === "chat-draft") {
        updateChatUi(`chat-draft:${surface.folderId}`, (current) => ({ ...current, notice: "모델을 선택하고 메시지를 입력하세요.", sessionError: "" }));
      }
      if (surface.kind === "chat-session") {
        const key = `chat:${surface.sessionId}`;
        updateChatUi(key, (current) => ({ ...current, notice: "채팅 세션을 불러왔습니다.", sessionError: "" }));
        void listChatSessionData(surface.sessionId).then((body) => {
          if (body.chatSession?.model) {
            setChatSelectedModelByKey((current) => ({ ...current, [key]: fromModelConfig(body.chatSession!.model) }));
          }
          if (body.chatSession) {
            setChatSessionByKey((current) => ({ ...current, [key]: body.chatSession! }));
          }
          setChatUiByKey((current) => ({
            ...current,
            [key]: {
              ...(current[key] ?? createSessionUiState()),
              agentRunning: Boolean(body.chatSession?.isrunning),
              notice: body.chatSession?.isrunning ? "응답 수신 중..." : "채팅 세션을 불러왔습니다.",
              chatMessages: chatRowsToMessages(body.data)
            }
          }));
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
      const optimisticUserMessage: ChatMessage = { id: `pending-user:${Date.now()}`, role: "user", text, attachments: [] };
      const pendingAssistantMessage: ChatMessage = { id: "pending-assistant", role: "assistant", text: "응답 생성 중...", attachments: [] };
      updateChatUi(key, (current) => ({ ...current, chatInput: "", agentRunning: true, notice: "응답 생성 중...", sessionError: "", chatMessages: [...current.chatMessages, optimisticUserMessage, pendingAssistantMessage] }));
      let requestUiKey = key;
      void (async () => {
        const model = toModelConfig(chatSelectedModel);
        const session: Pick<NDXAgentWebChatSession, "chatsessionid"> & Partial<NDXAgentWebChatSession> = surface.kind === "chat-draft"
          ? await createChatSession(surface.folderId, { model, title: text.slice(0, 80) })
          : { chatsessionid: surface.sessionId };
        const nextKey = `chat:${session.chatsessionid}`;
        requestUiKey = nextKey;
        if ("folderid" in session && session.folderid) {
          setChatSessionByKey((current) => ({ ...current, [nextKey]: session as NDXAgentWebChatSession }));
        }
        setChatSelectedModelByKey((current) => ({ ...current, [key]: chatSelectedModel, [nextKey]: chatSelectedModel }));
        setChatUiByKey((current) => ({
          ...current,
          [key]: { ...(current[key] ?? createSessionUiState()), agentRunning: true },
          [nextKey]: {
            ...(current[key] ?? createSessionUiState()),
            chatInput: "",
            agentRunning: true,
            notice: "응답 생성 중...",
            sessionError: "",
            chatMessages: [...((current[key] ?? createSessionUiState()).chatMessages.length > 0 ? (current[key] ?? createSessionUiState()).chatMessages : [optimisticUserMessage, pendingAssistantMessage])]
          }
        }));
        if (surface.kind === "chat-draft") {
          bridge.openChatSession(surface.folderId, session.chatsessionid);
        }
        window.dispatchEvent(new Event("ndx-chat-refresh"));
        const body = await appendChatSessionMessageStream(session.chatsessionid, { text, model }, (streamEvent) => {
          if (streamEvent.kind === "assistant_delta" || streamEvent.kind === "assistant_reasoning") {
            const streamText = streamEvent.kind === "assistant_delta" ? streamEvent.text : streamEvent.text ?? sessionDataContentsText(streamEvent.contents) ?? "";
            if (!streamText.trim()) return;
            setChatUiByKey((current) => ({
              ...current,
              [nextKey]: {
                ...(current[nextKey] ?? current[key] ?? createSessionUiState()),
                agentRunning: true,
                notice: "응답 수신 중...",
                chatMessages: [
                  ...(current[nextKey] ?? current[key] ?? createSessionUiState()).chatMessages.filter((message) => message.id !== "pending-assistant" && message.id !== `stream:${session.chatsessionid}`),
                  { id: `stream:${session.chatsessionid}`, role: "assistant", text: streamText, attachments: [] }
                ]
              }
            }));
          }
        });
        setChatSessionByKey((current) => ({ ...current, [nextKey]: body.session }));
        setChatSelectedModelByKey((current) => ({ ...current, [nextKey]: fromModelConfig(body.session.model) }));
        setChatUiByKey((current) => ({
          ...current,
          [nextKey]: {
            ...(current[nextKey] ?? current[key] ?? createSessionUiState()),
            agentRunning: false,
            notice: "응답이 완료되었습니다.",
            chatInput: "",
            sessionError: "",
            chatMessages: chatRowsToMessages(body.data)
          }
        }));
        window.dispatchEvent(new Event("ndx-chat-refresh"));
        finishAction(chatSubmitActionKey);
      })().catch((error) => {
        finishAction(chatSubmitActionKey);
        updateChatUi(requestUiKey, (current) => ({ ...current, agentRunning: false, chatInput: text, sessionError: error instanceof Error ? error.message : "채팅 요청이 실패했습니다.", notice: "" }));
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
      <SessionSurfaces activeUiKey={activeUiKey} clientState={clientState} hasPendingAction={hasPendingAction} notice={notice} sessionError={sessionError} sessionsByProject={sessionsByProject} sessionUiByKey={sessionUiByKey} skillsByProject={skillsByProject} surfaceKeys={surfaceKeys} t={t} updateSessionUi={updateSessionUi} onOpenMenu={onOpenMenu} onChatScroll={(key, scrollTop) => updateSessionUi(key, (current) => ({ ...current, chatScrollTop: scrollTop }))} onDisableAutoScroll={(key) => updateSessionUi(key, (current) => ({ ...current, autoScrollEnabled: false }))} onDismissError={(key) => updateSessionUi(key, (current) => ({ ...current, sessionError: "" }))} onChatInputChange={(key, value) => updateSessionUi(key, (current) => ({ ...current, chatInput: value }))} onAddAttachments={addChatAttachments} onAttachmentRejected={(key, message) => updateSessionUi(key, (current) => ({ ...current, notice: message }))} onRemoveAttachment={removeChatAttachment} onModelClick={(key) => { activeUiKeyRef.current = key; modelDialog.setOpen(true); }} onSkillListRefresh={sessionSocket.refreshSkillList} onSubmit={sessionRequest.submitChatRequest} onTurnToggle={sessionSocket.toggleTurnDetail} onIterationToggle={sessionSocket.toggleIterationDetail} />
      <ModalPortal>
        {sessionRename.dialog}
        {modelDialog.dialog}
        {askUserQuestion.dialog}
      </ModalPortal>
    </>
  );
}
