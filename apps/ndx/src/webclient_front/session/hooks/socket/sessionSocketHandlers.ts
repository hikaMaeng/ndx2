import type React from "react";
import {
  NDX_TURN_EVENT,
  type NDXSessionAttachedMessage,
  type NDXSessionCreatedMessage,
  type NDXSessionEventMessage,
  type NDXSessionHistorySummaryResultMessage,
  type NDXSessionIterationDetailResultMessage,
  type NDXSessionSidebarItemMessage,
  type NDXSessionSkillListResultMessage,
  type NDXSessionTurnDetailResultMessage
} from "ndx/common/protocol";
import {
  applyIterationDetail,
  applyProtocolEventToSessionUiState,
  chatMessageFromSessionEvent,
  interruptWasAccepted,
  mergeRestoredChatMessages,
  mergeRestoredTurnFlows,
  mergeTurnSummary,
  upsertRightSidebarItem,
  type NDXAgentWebContextUsage
} from "ndx/webclient/front";
import { RSC } from "../../../app/resource";
import type { SessionSocketControllerActions, UseSessionSocketControllerOptions } from "./types";

export type SessionSocketHandlers = {
  onHistorySummary: (message: NDXSessionHistorySummaryResultMessage) => void;
  onSkillList: (message: NDXSessionSkillListResultMessage) => void;
  onSidebarItem: (message: NDXSessionSidebarItemMessage) => void;
  onTurnDetail: (message: NDXSessionTurnDetailResultMessage) => void;
  onIterationDetail: (message: NDXSessionIterationDetailResultMessage) => void;
  onSessionEvent: (message: NDXSessionEventMessage) => void;
  onSessionCreated: (message: NDXSessionCreatedMessage) => void;
  onSessionAttached: (message: NDXSessionAttachedMessage) => void;
  onProtocolError: (message: { error: string }) => void;
  rejectActiveSessionRequest: (message: string) => void;
};

type SessionSocketHandlerRuntime = {
  attachSession: SessionSocketControllerActions["attachSession"];
  liveSessionIdsRef: React.MutableRefObject<Set<string>>;
  updateContextUsage: (usage?: NDXAgentWebContextUsage) => void;
};

export function createSessionSocketHandlers(options: UseSessionSocketControllerOptions, runtime: SessionSocketHandlerRuntime): SessionSocketHandlers {
  const {
    activeSession,
    activeSessionIdRef,
    activeUi,
    activeUiKeyRef,
    clearSessionError,
    draftSessionProjectIdRef,
    finishAction,
    pendingActionsRef,
    project,
    sessionRename,
    onSkillListReceived,
    sessionTokensRef,
    sessionUiManagerRef,
    setActiveSessionError,
    setActiveSessionId,
    setAgentRunning,
    setChatMessages,
    setCotWork,
    setDraftSessionProjectId,
    setNotice,
    setPendingActions,
    setSessionNotice,
    setSessionTokens,
    setSessionUiByKey,
    setTurnFlows,
    socketRef,
    stateRef,
    t,
    updateActiveUi,
    updateSessionUi
  } = options;
  const { attachSession, liveSessionIdsRef, updateContextUsage } = runtime;

  const rejectActiveSessionRequest = (message: string) => {
    const next = new Set(pendingActionsRef.current);
    next.delete("session-submit");
    next.delete("session-interrupt");
    pendingActionsRef.current = next;
    setPendingActions(next);
    updateSessionUi(activeUiKeyRef.current ?? activeSessionIdRef.current ?? "session", (current) => ({ ...current, pendingInitialRequest: undefined, pendingAttachRequest: undefined, agentRunning: false }));
    setActiveSessionError(message);
    setSessionNotice(message);
  };

  const onHistorySummary = (message: NDXSessionHistorySummaryResultMessage) => {
    if (message.sessionid !== activeSessionIdRef.current) return;
    updateContextUsage(message.contextUsage);
    setCotWork(undefined);
    setChatMessages((current) => mergeRestoredChatMessages(current, message.visibleEvents.flatMap((event) => {
      const chatMessage = chatMessageFromSessionEvent(event);
      return chatMessage ? [chatMessage] : [];
    })));
    setTurnFlows((current) => mergeRestoredTurnFlows(current, message.turns));
  };

  const onSkillList = (message: NDXSessionSkillListResultMessage) => {
    const projectName = message.projectName || activeSession?.projectname || draftSessionProjectIdRef.current || stateRef.current.activeProjectName;
    if (!projectName) return;
    onSkillListReceived(projectName, message.skills);
  };

  const onSidebarItem = (message: NDXSessionSidebarItemMessage) => {
    updateSessionUi(message.sessionid, (current) => ({
      ...current,
      rightSidebarItems: upsertRightSidebarItem(current.rightSidebarItems, message.item)
    }));
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
    }
    if (message.event === NDX_TURN_EVENT.Interrupted && !interruptWasAccepted(message.contents)) {
      finishAction(`session-interrupt:${message.sessionid}`);
      finishAction(`session-submit:${message.sessionid}`);
      finishAction("session-interrupt");
      finishAction("session-submit");
    }

    updateSessionUi(message.sessionid, (current) => {
      return applyProtocolEventToSessionUiState(current, message, {
        compactCompleted: "세션 히스토리 compact 완료",
        compactStarted: "세션 히스토리 compact 진행 중...",
        interruptPending: t[RSC.SESSION_COMPOSER_INTERRUPT_PENDING_STATUS],
        interruptStored: t[RSC.APP_STATUS_INTERRUPT_STORED_STATUS],
        operationInProgress: t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] || "응답 수신 중...",
        prefixDrift: "Prefix drift warning",
        requestStored: t[RSC.APP_STATUS_REQUEST_STORED_STATUS]
      });
    });
    if (!isActiveSessionEvent || message.event === NDX_TURN_EVENT.InputRecorded || message.event === NDX_TURN_EVENT.AssistantRecorded || message.event === NDX_TURN_EVENT.InterruptCompleted || (message.event === NDX_TURN_EVENT.Interrupted && !interruptWasAccepted(message.contents))) {
      void project.refreshSessions();
    }
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
    updateSessionUi(message.sessionid, (current) => ({ ...current, turnFlows: [], rightSidebarItems: [] }));
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
          isrunning: message.isrunning
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
    if (message.initialInputAccepted) {
      updateSessionUi(message.sessionid, (current) => ({ ...current, agentRunning: true, cotWork: undefined, rightSidebarItems: [] }));
      return;
    }
    if (!pending) return;
    if (message.connectionToken && socketRef.current?.sendInput(message.connectionToken, pending.text, pending.model, pending.attachments)) {
      updateSessionUi(message.sessionid, (current) => ({ ...current, cotWork: undefined, rightSidebarItems: [] }));
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
      updateSessionUi(message.sessionid, (current) => ({ ...current, agentRunning: true, cotWork: undefined, rightSidebarItems: [] }));
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
    updateActiveUi((current) => ({ ...current, pendingInitialRequest: undefined, pendingAttachRequest: undefined, sessionError: message.error, notice: message.error }));
    if (hadSessionRequest) {
      setAgentRunning(false);
    }
    if (renameFailed) {
      sessionRename.applyProtocolErrorFailure();
    }
  };

  return {
    onHistorySummary,
    onSkillList,
    onSidebarItem,
    onTurnDetail,
    onIterationDetail,
    onSessionEvent,
    onSessionCreated,
    onSessionAttached,
    onProtocolError,
    rejectActiveSessionRequest
  };
}
