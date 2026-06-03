import React from "react";
import type { NDXAgentWebMetadataResponse, NDXAgentWebSession, NDXWebClientStateDocument } from "ndx/webclient/common";
import { applyIterationDetail, applyTurnEvent, chatMessageFromSessionEvent, interruptWasAccepted, mergeRestoredChatMessages, mergeRestoredTurnFlows, mergeTurnSummary, sessionDataContentsText, sessionDataToChatMessage, type NDXAgentWebContextUsage, type SessionUiState, type SocketState, type TurnFlowState } from "ndx/webclient/front";
import { NDX_TURN_EVENT, isNDXCotWorkContents, type NDXSessionAttachedMessage, type NDXSessionClientRequestClosedMessage, type NDXSessionClientRequestMessage, type NDXSessionCreatedMessage, type NDXSessionEventMessage, type NDXSessionHistorySummaryResultMessage, type NDXSessionIterationDetailResultMessage, type NDXSessionIterationSummary, type NDXSessionSkillListResultMessage, type NDXSessionSlideWindowUpdatedMessage, type NDXSessionTurnDetailResultMessage } from "ndx/common/protocol";
import { applyProjectSocketMessage, type NDXSessionDeletedMessage, type NDXSessionListChangedMessage, type NDXSessionRenamedMessage } from "../../menu/project/socket/projectSocket";
import { RSC } from "../../app/resource";
import { openSessionSocket, type SessionSocketClient } from "../socket/sessionSocket";

type SessionUiManagerRef = React.MutableRefObject<{
  findKey: (predicate: (ui: SessionUiState) => boolean) => string | undefined;
  get: (key: string) => SessionUiState | undefined;
  promoteToSession: (sessionid: string, previousKey: string) => void;
  snapshot: Record<string, SessionUiState>;
}>;

type UseSessionSocketControllerOptions = {
  activeSession?: NDXAgentWebSession;
  activeSessionId?: string;
  activeSessionIdRef: React.MutableRefObject<string | undefined>;
  activeUi?: SessionUiState;
  activeUiKeyRef: React.MutableRefObject<string | undefined>;
  clientid: string;
  clearSessionError: () => void;
  draftSessionProjectId?: string;
  draftSessionProjectIdRef: React.MutableRefObject<string | undefined>;
  finishAction: (key: string) => void;
  metadata: Partial<NDXAgentWebMetadataResponse>;
  pendingActionsRef: React.MutableRefObject<Set<string>>;
  project: {
    applySessionDeleted: (message: NDXSessionDeletedMessage) => void;
    reloadChangedSessionList: (message: NDXSessionListChangedMessage) => void;
    refreshSessions: () => Promise<void>;
    setSessionsByProject: React.Dispatch<React.SetStateAction<Record<string, NDXAgentWebSession[]>>>;
  };
  saveState: (nextState: NDXWebClientStateDocument) => void;
  sessionRename: {
    applyProtocolErrorFailure: () => void;
    applyRenamed: (message: NDXSessionRenamedMessage) => void;
  };
  onClientRequest: (message: NDXSessionClientRequestMessage) => void;
  onClientRequestClosed: (message: NDXSessionClientRequestClosedMessage) => void;
  sessionTokensRef: React.MutableRefObject<Record<string, string>>;
  sessionUiManagerRef: SessionUiManagerRef;
  setActiveSessionError: (message: string) => void;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setAgentRunning: (running: boolean) => void;
  setAvailableSkills: (skills: unknown[]) => void;
  setChatMessages: (update: SessionUiState["chatMessages"] | ((current: SessionUiState["chatMessages"]) => SessionUiState["chatMessages"])) => void;
  setCotWork: (work: SessionUiState["cotWork"]) => void;
  setDraftSessionProjectId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setLastProtocolEvent: React.Dispatch<React.SetStateAction<string>>;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
  setPendingActions: React.Dispatch<React.SetStateAction<Set<string>>>;
  setReportedContextUsage: (update: NDXAgentWebContextUsage | undefined | ((current?: NDXAgentWebContextUsage) => NDXAgentWebContextUsage | undefined)) => void;
  setSessionNotice: (message: string) => void;
  setSessionTokens: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setSessionUiByKey: React.Dispatch<React.SetStateAction<Record<string, SessionUiState>>>;
  setSocketState: React.Dispatch<React.SetStateAction<SocketState>>;
  setTurnFlows: (update: SessionUiState["turnFlows"] | ((current: SessionUiState["turnFlows"]) => SessionUiState["turnFlows"])) => void;
  socketRef: React.MutableRefObject<SessionSocketClient | null>;
  socketState: SocketState;
  stateRef: React.MutableRefObject<NDXWebClientStateDocument>;
  t: Record<string, string>;
  updateActiveUi: (update: (current: SessionUiState) => SessionUiState) => void;
  updateSessionUi: (key: string, update: (current: SessionUiState) => SessionUiState) => void;
};

export function useSessionSocketController({
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
  project,
  saveState,
  sessionRename,
  onClientRequest,
  onClientRequestClosed,
  sessionTokensRef,
  sessionUiManagerRef,
  setActiveSessionError,
  setActiveSessionId,
  setAgentRunning,
  setAvailableSkills,
  setChatMessages,
  setCotWork,
  setDraftSessionProjectId,
  setLastProtocolEvent,
  setNotice,
  setPendingActions,
  setReportedContextUsage,
  setSessionNotice,
  setSessionTokens,
  setSessionUiByKey,
  setSocketState,
  setTurnFlows,
  socketRef,
  socketState,
  stateRef,
  t,
  updateActiveUi,
  updateSessionUi
}: UseSessionSocketControllerOptions) {
  const requestedTurnDetailsRef = React.useRef<Set<string>>(new Set());
  const requestedIterationDetailsRef = React.useRef<Set<string>>(new Set());
  const liveSessionIdsRef = React.useRef<Set<string>>(new Set());

  const updateContextUsage = (usage?: NDXAgentWebContextUsage) => {
    if (!usage) return;
    setReportedContextUsage((current) => ({
      ...usage,
      parts: usage.parts ?? current?.parts
    }));
  };

  const attachSession = (session: NDXAgentWebSession) => {
    if (sessionTokensRef.current[session.sessionid]) return true;
    if (socketState !== "connected" || !socketRef.current?.isOpen()) return false;
    return Boolean(socketRef.current?.attachSession({
      userid: session.userid,
      projectName: session.projectname,
      sessionid: session.sessionid
    }));
  };

  const refreshSkillList = () => {
    const sessionid = activeSessionIdRef.current;
    const token = sessionid ? sessionTokensRef.current[sessionid] : undefined;
    return Boolean(socketRef.current?.requestSkillList(token));
  };

  const updateSlideWindow = (sessionid: string, slidewindow: number) => {
    const token = sessionTokensRef.current[sessionid];
    if (!token) return false;
    updateSessionUi(sessionid, (current) => ({ ...current, pendingSlideWindow: slidewindow }));
    return Boolean(socketRef.current?.updateSlideWindow(token, slidewindow));
  };

  const toggleTurnDetail = (turn: TurnFlowState, open: boolean) => {
    setTurnFlows((turns) => turns.map((current) => current.id === turn.id ? { ...current, collapsed: !open } : current));
    if (!open) return;
    const key = `${turn.sessionid}:${turn.inputDataId}`;
    if (requestedTurnDetailsRef.current.has(key)) return;
    const token = sessionTokensRef.current[turn.sessionid];
    if (!token || !socketRef.current?.requestTurnDetail(token, turn.inputDataId)) return;
    requestedTurnDetailsRef.current.add(key);
  };

  const toggleIterationDetail = (turn: TurnFlowState, iteration: Pick<NDXSessionIterationSummary, "iteration">, open: boolean, userInitiated = true) => {
    if (!userInitiated) return;
    setTurnFlows((turns) => turns.map((current) => current.id === turn.id
      ? {
        ...current,
        batches: current.batches.map((batch) => batch.iteration === iteration.iteration ? { ...batch, collapsed: !open, manuallyExpanded: open } : batch)
      }
      : current));
    if (!open) return;
    const key = `${turn.sessionid}:${turn.inputDataId}:${iteration.iteration}`;
    if (requestedIterationDetailsRef.current.has(key)) return;
    const token = sessionTokensRef.current[turn.sessionid];
    if (!token || !socketRef.current?.requestIterationDetail(token, turn.inputDataId, iteration.iteration)) return;
    requestedIterationDetailsRef.current.add(key);
  };

  const rejectActiveSessionRequest = (message: string) => {
    const next = new Set(pendingActionsRef.current);
    next.delete("session-submit");
    next.delete("session-interrupt");
    pendingActionsRef.current = next;
    setPendingActions(next);
    updateActiveUi((current) => ({ ...current, pendingInitialRequest: undefined, pendingAttachRequest: undefined }));
    setAgentRunning(false);
    setActiveSessionError(message);
    setSessionNotice(message);
  };

  const onHistorySummary = (message: NDXSessionHistorySummaryResultMessage) => {
    if (message.sessionid !== activeSessionIdRef.current) return;
    updateContextUsage(message.contextUsage);
    setCotWork(undefined);
    setChatMessages((current) => mergeRestoredChatMessages(current, message.visibleEvents.map(chatMessageFromSessionEvent)));
    setTurnFlows((current) => mergeRestoredTurnFlows(current, message.turns));
  };

  const onSkillList = (message: NDXSessionSkillListResultMessage) => {
    setAvailableSkills(message.skills);
  };

  const onSlideWindowUpdated = (message: NDXSessionSlideWindowUpdatedMessage) => {
    project.setSessionsByProject((current) => ({
      ...current,
      [message.projectname]: (current[message.projectname] ?? []).map((session) => session.sessionid === message.sessionid ? { ...session, slidewindow: message.slidewindow, lastupdated: message.lastupdated } : session)
    }));
    updateSessionUi(message.sessionid, (current) => ({ ...current, pendingSlideWindow: undefined }));
  };

  const onTurnDetail = (message: NDXSessionTurnDetailResultMessage) => {
    if (message.sessionid !== activeSessionIdRef.current || !message.turn) return;
    const turn = message.turn;
    setTurnFlows((turns) => mergeTurnSummary(turns, turn));
  };

  const onIterationDetail = (message: NDXSessionIterationDetailResultMessage) => {
    if (message.sessionid !== activeSessionIdRef.current) return;
    setTurnFlows((turns) => applyIterationDetail(turns, message));
  };

  const onSessionEvent = (message: NDXSessionEventMessage) => {
    clearSessionError();
    liveSessionIdsRef.current.add(message.sessionid);
    const isActiveSessionEvent = message.sessionid === activeSessionIdRef.current;
    if (message.event === NDX_TURN_EVENT.AssistantRecorded) {
      finishAction(`session-submit:${message.sessionid}`);
      finishAction("session-submit");
    }
    if (message.event === NDX_TURN_EVENT.InterruptCompleted) {
      finishAction(`session-interrupt:${message.sessionid}`);
      finishAction(`session-submit:${message.sessionid}`);
      finishAction("session-interrupt");
      finishAction("session-submit");
      if (isActiveSessionEvent) {
        setCotWork(undefined);
        setAgentRunning(false);
        setNotice(t[RSC.APP_STATUS_INTERRUPT_STORED_STATUS]);
      }
    }
    if (message.event === NDX_TURN_EVENT.Interrupted && !interruptWasAccepted(message.contents)) {
      finishAction(`session-interrupt:${message.sessionid}`);
      finishAction(`session-submit:${message.sessionid}`);
      finishAction("session-interrupt");
      finishAction("session-submit");
      if (isActiveSessionEvent) {
        setCotWork(undefined);
      }
    }
    if (!isActiveSessionEvent) {
      updateSessionUi(message.sessionid, (current) => {
        const next = { ...current };
        if (message.contextUsage) {
          next.reportedContextUsage = { ...message.contextUsage, parts: message.contextUsage.parts ?? current.reportedContextUsage?.parts };
        }
        if (message.event === NDX_TURN_EVENT.CotWork && isNDXCotWorkContents(message.contents)) {
          next.cotWork = message.contents;
          next.agentRunning = true;
          next.notice = t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] || "응답 수신 중...";
          return next;
        }
        if (message.event === NDX_TURN_EVENT.CompactStarted) {
          next.compactRunning = true;
          next.agentRunning = true;
          next.notice = sessionDataContentsText(message.contents) ?? "세션 히스토리 compact 진행 중...";
          next.turnFlows = applyTurnEvent(current.turnFlows, message);
          return next;
        }
        if (message.event === NDX_TURN_EVENT.CompactCompleted) {
          next.compactRunning = false;
          next.agentRunning = true;
          next.notice = sessionDataContentsText(message.contents) ?? "세션 히스토리 compact 완료";
          next.turnFlows = applyTurnEvent(current.turnFlows, message);
          return next;
        }
        next.turnFlows = applyTurnEvent(current.turnFlows, message);
        if (message.event === NDX_TURN_EVENT.AssistantDelta || message.event === NDX_TURN_EVENT.AssistantReasoning) {
          const text = sessionDataContentsText(message.contents) ?? JSON.stringify(message.contents);
          next.agentRunning = true;
          next.notice = t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] || "응답 수신 중...";
          next.chatMessages = [...current.chatMessages.filter((item) => item.id !== "empty" && item.id !== `stream:${message.sessionid}`), { id: `stream:${message.sessionid}`, role: "assistant", text, attachments: [] }];
          return next;
        }
        if (message.event === NDX_TURN_EVENT.ModelProgress) {
          next.agentRunning = true;
          next.notice = sessionDataContentsText(message.contents) ?? t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] ?? "응답 수신 중...";
          return next;
        }
        if (
          message.event === NDX_TURN_EVENT.ModelRequest ||
          message.event === NDX_TURN_EVENT.ModelResume ||
          message.event === NDX_TURN_EVENT.ToolCallRecorded ||
          message.event === NDX_TURN_EVENT.ToolBatchStarted ||
          message.event === NDX_TURN_EVENT.ToolProgress ||
          message.event === NDX_TURN_EVENT.ToolResultRecorded
        ) {
          next.agentRunning = true;
          next.notice = t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] || "응답 수신 중...";
          return next;
        }
        if (message.event === NDX_TURN_EVENT.InterruptCompleted) {
          next.cotWork = undefined;
          next.agentRunning = false;
          next.notice = t[RSC.APP_STATUS_INTERRUPT_STORED_STATUS];
          return next;
        }
        const rowType = message.event === NDX_TURN_EVENT.Interrupted ? "interrupt" : message.event === NDX_TURN_EVENT.AssistantRecorded ? "assistant" : "user";
        const nextMessage = sessionDataToChatMessage({ dataid: message.dataid, sessionid: message.sessionid, type: rowType, contents: message.contents, createdat: message.createdat });
        next.agentRunning = message.event === NDX_TURN_EVENT.InputRecorded;
        next.compactRunning = false;
        next.notice = message.event === NDX_TURN_EVENT.Interrupted ? t[RSC.APP_STATUS_INTERRUPT_STORED_STATUS] : t[RSC.APP_STATUS_REQUEST_STORED_STATUS];
        next.chatMessages = current.chatMessages.filter((item) => item.id !== "empty" && item.id !== nextMessage.id && (message.event !== NDX_TURN_EVENT.AssistantRecorded || item.id !== `stream:${message.sessionid}`)).concat(nextMessage);
        return next;
      });
      void project.refreshSessions();
      return;
    }

    if (message.event === NDX_TURN_EVENT.InterruptCompleted) {
      void project.refreshSessions();
      setTurnFlows((turns) => applyTurnEvent(turns, message));
      return;
    }

    if (message.event === NDX_TURN_EVENT.Interrupted && interruptWasAccepted(message.contents)) {
      updateContextUsage(message.contextUsage);
      setAgentRunning(true);
      setNotice(t[RSC.SESSION_COMPOSER_INTERRUPT_PENDING_STATUS]);
      return;
    }

    if (message.event === NDX_TURN_EVENT.CotWork && isNDXCotWorkContents(message.contents)) {
      updateContextUsage(message.contextUsage);
      setCotWork(message.contents);
      setAgentRunning(true);
      setNotice(t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] || "응답 수신 중...");
      return;
    }

    setTurnFlows((turns) => applyTurnEvent(turns, message));
    if (message.event === NDX_TURN_EVENT.CompactStarted) {
      updateContextUsage(message.contextUsage);
      updateActiveUi((current) => ({ ...current, compactRunning: true, agentRunning: true }));
      setNotice(sessionDataContentsText(message.contents) ?? "세션 히스토리 compact 진행 중...");
      return;
    }
    if (message.event === NDX_TURN_EVENT.CompactCompleted) {
      updateContextUsage(message.contextUsage);
      updateActiveUi((current) => ({ ...current, compactRunning: false, agentRunning: true }));
      setNotice(sessionDataContentsText(message.contents) ?? "세션 히스토리 compact 완료");
      return;
    }
    if (message.event === NDX_TURN_EVENT.AssistantDelta || message.event === NDX_TURN_EVENT.AssistantReasoning) {
      updateContextUsage(message.contextUsage);
      setAgentRunning(true);
      setNotice(t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] || "응답 수신 중...");
      const text = sessionDataContentsText(message.contents) ?? JSON.stringify(message.contents);
      setChatMessages((messages) => {
        const streamId = `stream:${message.sessionid}`;
        const next = messages.filter((item) => item.id !== "empty" && item.id !== streamId);
        return [...next, { id: streamId, role: "assistant", text, attachments: [] }];
      });
      return;
    }
    if (message.event === NDX_TURN_EVENT.ModelProgress) {
      updateContextUsage(message.contextUsage);
      setAgentRunning(true);
      setNotice(sessionDataContentsText(message.contents) ?? t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] ?? "응답 수신 중...");
      return;
    }
    if (
      message.event === NDX_TURN_EVENT.ModelRequest ||
      message.event === NDX_TURN_EVENT.ModelResume ||
      message.event === NDX_TURN_EVENT.ToolCallRecorded ||
      message.event === NDX_TURN_EVENT.ToolBatchStarted ||
      message.event === NDX_TURN_EVENT.ToolProgress ||
      message.event === NDX_TURN_EVENT.ToolResultRecorded
    ) {
      updateContextUsage(message.contextUsage);
      setAgentRunning(true);
      setNotice(t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] || "응답 수신 중...");
      return;
    }
    updateContextUsage(message.contextUsage);
    setAgentRunning(message.event === NDX_TURN_EVENT.InputRecorded);
    if (message.event === NDX_TURN_EVENT.AssistantRecorded || message.event === NDX_TURN_EVENT.Interrupted) {
      updateActiveUi((current) => ({ ...current, compactRunning: false }));
    }
    setNotice(message.event === NDX_TURN_EVENT.Interrupted ? t[RSC.APP_STATUS_INTERRUPT_STORED_STATUS] : t[RSC.APP_STATUS_REQUEST_STORED_STATUS]);
    const rowType = message.event === NDX_TURN_EVENT.Interrupted ? "interrupt" : message.event === NDX_TURN_EVENT.AssistantRecorded ? "assistant" : "user";
    const nextMessage = sessionDataToChatMessage({ dataid: message.dataid, sessionid: message.sessionid, type: rowType, contents: message.contents, createdat: message.createdat });
    setChatMessages((messages) => {
      const next = messages.filter((item) => item.id !== "empty" && item.id !== nextMessage.id && (message.event !== NDX_TURN_EVENT.AssistantRecorded || item.id !== `stream:${message.sessionid}`));
      return [...next, nextMessage];
    });
    void project.refreshSessions();
  };

  const onSessionCreated = (message: NDXSessionCreatedMessage) => {
    clearSessionError();
    liveSessionIdsRef.current.add(message.sessionid);
    const previousUiKey =
      sessionUiManagerRef.current.findKey((ui) => Boolean(ui.pendingInitialRequest)) ??
      activeSessionIdRef.current ??
      (message.projectname ? `draft:${message.projectname}` : undefined);
    if (previousUiKey) {
      sessionUiManagerRef.current.promoteToSession(message.sessionid, previousUiKey);
      setSessionUiByKey(sessionUiManagerRef.current.snapshot);
    }
    activeSessionIdRef.current = message.sessionid;
    activeUiKeyRef.current = message.sessionid;
    draftSessionProjectIdRef.current = undefined;
    setDraftSessionProjectId(undefined);
    setActiveSessionId(message.sessionid);
    updateSessionUi(message.sessionid, (current) => ({ ...current, turnFlows: [] }));
    project.setSessionsByProject((current) => ({
      ...current,
      [message.projectname]: [
        {
          sessionid: message.sessionid,
          userid: message.userid,
          title: message.title,
          lastupdated: message.lastupdated,
          mode: message.mode,
          path: message.path,
          projectname: message.projectname,
          model: message.model,
          isrunning: message.isrunning,
          slidewindow: message.slidewindow
        },
        ...(current[message.projectname] ?? []).filter((session) => session.sessionid !== message.sessionid)
      ]
    }));
    if (message.connectionToken) {
      const nextTokens = { ...sessionTokensRef.current, [message.sessionid]: message.connectionToken };
      sessionTokensRef.current = nextTokens;
      setSessionTokens(nextTokens);
      socketRef.current?.requestSkillList(message.connectionToken);
    }
    void project.refreshSessions();
    const pending = sessionUiManagerRef.current.get(message.sessionid)?.pendingInitialRequest;
    updateSessionUi(message.sessionid, (current) => ({ ...current, pendingInitialRequest: undefined }));
    if (!pending) return;
    if (message.connectionToken && socketRef.current?.sendInput(message.connectionToken, pending.text, pending.model, pending.attachments)) {
      updateSessionUi(message.sessionid, (current) => ({ ...current, cotWork: undefined }));
      return;
    }
    finishAction("session-submit");
    setAgentRunning(false);
    setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
  };

  const onSessionAttached = (message: NDXSessionAttachedMessage) => {
    clearSessionError();
    const nextTokens = { ...sessionTokensRef.current, [message.sessionid]: message.connectionToken };
    sessionTokensRef.current = nextTokens;
    setSessionTokens(nextTokens);
    if (message.sessionid === activeSessionIdRef.current) {
      socketRef.current?.requestHistorySummary(message.connectionToken);
      socketRef.current?.requestSkillList(message.connectionToken);
    }
    const pending = sessionUiManagerRef.current.get(message.sessionid)?.pendingAttachRequest;
    if (pending?.sessionid !== message.sessionid) return;
    updateSessionUi(message.sessionid, (current) => ({ ...current, pendingAttachRequest: undefined }));
    if (socketRef.current?.sendInput(message.connectionToken, pending.text, pending.model, pending.attachments)) {
      updateSessionUi(message.sessionid, (current) => ({ ...current, cotWork: undefined, turnFlows: [] }));
      return;
    }
    finishAction("session-submit");
    setAgentRunning(false);
    setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
  };

  const onProtocolError = (message: { error: string }) => {
    const next = new Set(pendingActionsRef.current);
    let renameFailed = false;
    const hadSessionRequest = next.has("session-submit") || next.has("session-interrupt") || Boolean(activeUi?.pendingInitialRequest || activeUi?.pendingAttachRequest);
    for (const action of next) {
      if (action === "session-submit" || action === "session-interrupt") {
        next.delete(action);
      }
      if (action.startsWith("session-delete:")) {
        next.delete(action);
      }
      if (action.startsWith("session-rename:")) {
        next.delete(action);
        renameFailed = true;
      }
    }
    pendingActionsRef.current = next;
    setPendingActions(next);
    updateActiveUi((current) => ({ ...current, pendingInitialRequest: undefined, pendingAttachRequest: undefined, pendingSlideWindow: undefined, sessionError: message.error, notice: message.error }));
    if (hadSessionRequest) {
      setAgentRunning(false);
    }
    if (renameFailed) {
      sessionRename.applyProtocolErrorFailure();
    }
  };

  React.useEffect(() => {
    if (!activeSessionId) {
      return;
    }
    setDraftSessionProjectId(undefined);
    const token = sessionTokensRef.current[activeSessionId];
    if (token && socketRef.current?.requestHistorySummary(token)) return;
    if (activeSession) attachSession(activeSession);
  }, [activeSessionId, draftSessionProjectId, activeSession?.sessionid]);

  React.useEffect(() => () => socketRef.current?.close(), []);

  React.useEffect(() => {
    if (!metadata.session?.socketUrl) {
      return;
    }

    socketRef.current?.close();
    sessionTokensRef.current = {};
    setSessionTokens({});
    socketRef.current = openSessionSocket({
      clientid,
      metadata,
      getState: () => stateRef.current,
      setState: saveState,
      setSocketState,
      setLastProtocolEvent,
      setNotice,
      t,
      onSocketOpen: () => undefined,
      onSessionCreated,
      onSessionAttached,
      onSessionEvent,
      onHistorySummary,
      onSkillList,
      onSlideWindowUpdated,
      onTurnDetail,
      onIterationDetail,
      onClientRequest,
      onClientRequestClosed,
      onUnhandledMessage: (message) => applyProjectSocketMessage(message, {
        onSessionDeleted: (deleted) => {
          liveSessionIdsRef.current.delete(deleted.sessionid);
          project.applySessionDeleted(deleted);
        },
        onSessionListChanged: project.reloadChangedSessionList,
        onSessionRenamed: sessionRename.applyRenamed
      }),
      onProtocolError,
      onTransportError: rejectActiveSessionRequest
    }) ?? null;
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [metadata.session?.socketUrl]);

  React.useEffect(() => {
    if (socketState === "connected" && socketRef.current?.isOpen() && activeSession) {
      attachSession(activeSession);
    }
  }, [socketState, activeSession?.sessionid]);

  return {
    attachSession,
    refreshSkillList,
    updateSlideWindow,
    toggleIterationDetail,
    toggleTurnDetail
  };
}
