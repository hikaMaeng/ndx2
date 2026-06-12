import type React from "react";
import {
  NDX_TURN_EVENT,
  type NDXSessionAttachedMessage,
  type NDXSessionBranchCreatedMessage,
  type NDXSessionCreatedMessage,
  type NDXSessionEventMessage,
  type NDXSessionHistorySummaryResultMessage,
  type NDXSessionIterationDetailResultMessage,
  type NDXSessionSidebarItemMessage,
  type NDXSessionSkillListResultMessage,
  type NDXSessionTurnDetailResultMessage,
  type NDXSessionTurnDeletedMessage
} from "ndx/common/protocol";
import {
  applyIterationDetail,
  applyProtocolEventToSessionUiState,
  chatMessagesFromHistorySummary,
  interruptWasAccepted,
  mergeRestoredChatMessages,
  mergeRestoredTurnFlows,
  mergeTurnSummary,
  withoutPendingUserChatMessages,
  type NDXAgentWebContextUsage
} from "ndx/webclient/front";
import { RSC } from "../../../app/resource";
import { applyRightSidebarItemMessage, rightSidebarCleared } from "../../rightsidebar/state";
import type { SessionSocketControllerActions, UseSessionSocketControllerOptions } from "./types";

export type SessionSocketHandlers = {
  onHistorySummary: (message: NDXSessionHistorySummaryResultMessage) => void;
  onSkillList: (message: NDXSessionSkillListResultMessage) => void;
  onSidebarItem: (message: NDXSessionSidebarItemMessage) => void;
  onTurnDetail: (message: NDXSessionTurnDetailResultMessage) => void;
  onIterationDetail: (message: NDXSessionIterationDetailResultMessage) => void;
  onTurnDeleted: (message: NDXSessionTurnDeletedMessage) => void;
  onBranchCreated: (message: NDXSessionBranchCreatedMessage) => void;
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
    attachedSessionIdsRef,
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
    setAttachedSessionIds,
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
    if (activeUiKeyRef.current) next.delete(`session-submit:${activeUiKeyRef.current}`);
    if (activeSessionIdRef.current) {
      next.delete(`session-submit:${activeSessionIdRef.current}`);
      next.delete(`session-interrupt:${activeSessionIdRef.current}`);
    }
    pendingActionsRef.current = next;
    setPendingActions(next);
    updateSessionUi(activeUiKeyRef.current ?? activeSessionIdRef.current ?? "session", (current) => ({ ...current, pendingInitialRequest: undefined, pendingAttachRequest: undefined, agentRunning: false, chatMessages: withoutPendingUserChatMessages(current.chatMessages) }));
    setActiveSessionError(message);
    setSessionNotice(message);
  };

  const migrateSubmitAction = (previousKey: string | undefined, sessionid: string) => {
    if (!previousKey || previousKey === sessionid) return;
    const previousAction = `session-submit:${previousKey}`;
    if (!pendingActionsRef.current.has(previousAction)) return;
    const next = new Set(pendingActionsRef.current);
    next.delete(previousAction);
    next.add(`session-submit:${sessionid}`);
    pendingActionsRef.current = next;
    setPendingActions(next);
  };

  const onHistorySummary = (message: NDXSessionHistorySummaryResultMessage) => {
    if (message.sessionid !== activeSessionIdRef.current) return;
    updateContextUsage(message.contextUsage);
    setCotWork(undefined);
    setChatMessages((current) => mergeRestoredChatMessages(current, chatMessagesFromHistorySummary(message.visibleEvents, message.turns)));
    setTurnFlows((current) => mergeRestoredTurnFlows(current, message.turns));
  };

  const onSkillList = (message: NDXSessionSkillListResultMessage) => {
    const projectName = message.projectName || activeSession?.projectname || draftSessionProjectIdRef.current || stateRef.current.activeProjectName;
    if (!projectName) return;
    onSkillListReceived(projectName, message.skills);
  };

  const onSidebarItem = (message: NDXSessionSidebarItemMessage) => {
    applyRightSidebarItemMessage(updateSessionUi, message);
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

  const onTurnDeleted = (message: NDXSessionTurnDeletedMessage) => {
    finishAction(`session-turn-delete:${message.sessionid}:${message.inputDataId}`);
    const deletedIds = new Set(message.deletedDataIds);
    updateSessionUi(message.sessionid, (current) => ({
      ...current,
      notice: "세션 턴을 삭제했습니다.",
      chatMessages: current.chatMessages.filter((item) => !deletedIds.has(item.id)),
      turnFlows: current.turnFlows.filter((turn) => turn.inputDataId !== message.inputDataId && !deletedIds.has(turn.inputDataId))
    }));
    if (message.sessionid === activeSessionIdRef.current) {
      socketRef.current?.requestHistorySummary(message.sessionid);
    }
    void project.refreshSessions();
  };

  const onBranchCreated = (message: NDXSessionBranchCreatedMessage) => {
    finishAction(`session-branch:${message.sourceSessionid}:${message.inputDataId}`);
    const session = message.session;
    project.setSessionsByProject((current) => ({
      ...current,
      [session.projectname]: [
        {
          sessionid: session.sessionid,
          userid: session.userid,
          title: session.title,
          lastupdated: session.lastupdated,
          mode: session.mode,
          path: session.path,
          projectname: session.projectname,
          model: session.model,
          isrunning: session.isrunning
        },
        ...(current[session.projectname] ?? []).filter((item) => item.sessionid !== session.sessionid)
      ]
    }));
    const nextAttached = new Set(attachedSessionIdsRef.current);
    nextAttached.add(session.sessionid);
    attachedSessionIdsRef.current = nextAttached;
    setAttachedSessionIds(nextAttached);
    activeSessionIdRef.current = session.sessionid;
    activeUiKeyRef.current = session.sessionid;
    draftSessionProjectIdRef.current = undefined;
    setDraftSessionProjectId(undefined);
    setActiveSessionId(session.sessionid);
    updateSessionUi(session.sessionid, (current) => ({
      ...rightSidebarCleared(current),
      agentRunning: false,
      notice: "분기 세션을 생성했습니다.",
      sessionError: "",
      chatMessages: [],
      turnFlows: []
    }));
    project.openProjectSession(session.projectname, session.sessionid);
    socketRef.current?.requestHistorySummary(session.sessionid);
    socketRef.current?.requestSkillList(session.sessionid);
    void project.refreshSessions();
  };

  const onSessionEvent = (message: NDXSessionEventMessage) => {
    clearSessionError();
    liveSessionIdsRef.current.add(message.sessionid);
    const isActiveSessionEvent = message.sessionid === activeSessionIdRef.current;
    if (message.event === NDX_TURN_EVENT.AssistantRecorded || message.event === NDX_TURN_EVENT.TurnEnd) {
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
    if (!isActiveSessionEvent || message.event === NDX_TURN_EVENT.InputRecorded || message.event === NDX_TURN_EVENT.AssistantRecorded || message.event === NDX_TURN_EVENT.TurnEnd || message.event === NDX_TURN_EVENT.InterruptCompleted || (message.event === NDX_TURN_EVENT.Interrupted && !interruptWasAccepted(message.contents))) {
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
      migrateSubmitAction(previousUiKey, message.sessionid);
    }
    activeSessionIdRef.current = message.sessionid;
    activeUiKeyRef.current = message.sessionid;
    draftSessionProjectIdRef.current = undefined;
    setDraftSessionProjectId(undefined);
    setActiveSessionId(message.sessionid);
    updateSessionUi(message.sessionid, (current) => rightSidebarCleared({ ...current, turnFlows: [] }));
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
    const nextAttached = new Set(attachedSessionIdsRef.current);
    nextAttached.add(message.sessionid);
    attachedSessionIdsRef.current = nextAttached;
    setAttachedSessionIds(nextAttached);
    socketRef.current?.requestSkillList(message.sessionid);
    void project.refreshSessions();
    const pending = sessionUiManagerRef.current.get(message.sessionid)?.pendingInitialRequest;
    updateSessionUi(message.sessionid, (current) => ({ ...current, pendingInitialRequest: undefined }));
    if (message.initialInputAccepted) {
      updateSessionUi(message.sessionid, (current) => rightSidebarCleared({ ...current, agentRunning: true, cotWork: undefined }));
      return;
    }
    if (!pending) return;
    if (socketRef.current?.sendInput(message.sessionid, pending.text, pending.model, pending.attachments)) {
      updateSessionUi(message.sessionid, (current) => rightSidebarCleared({ ...current, cotWork: undefined }));
      return;
    }
    finishAction("session-submit");
    setAgentRunning(false);
    setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
  };

  const onSessionAttached = (message: NDXSessionAttachedMessage) => {
    clearSessionError();
    const nextAttached = new Set(attachedSessionIdsRef.current);
    nextAttached.add(message.sessionid);
    attachedSessionIdsRef.current = nextAttached;
    setAttachedSessionIds(nextAttached);
    if (message.sessionid === activeSessionIdRef.current) {
      socketRef.current?.requestHistorySummary(message.sessionid);
      socketRef.current?.requestSkillList(message.sessionid);
    }
    const pending = sessionUiManagerRef.current.get(message.sessionid)?.pendingAttachRequest;
    if (pending?.sessionid !== message.sessionid) return;
    updateSessionUi(message.sessionid, (current) => ({ ...current, pendingAttachRequest: undefined }));
    if (socketRef.current?.sendInput(message.sessionid, pending.text, pending.model, pending.attachments)) {
      updateSessionUi(message.sessionid, (current) => rightSidebarCleared({ ...current, agentRunning: true, cotWork: undefined }));
      return;
    }
    finishAction("session-submit");
    setAgentRunning(false);
    setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
  };

  const onProtocolError = (message: { error: string }) => {
    const next = new Set(pendingActionsRef.current);
    let renameFailed = false;
    const hadSessionRequest = [...next].some((action) => action === "session-submit" || action === "session-interrupt" || action.startsWith("session-submit:") || action.startsWith("session-interrupt:")) || Boolean(activeUi?.pendingInitialRequest || activeUi?.pendingAttachRequest);
    for (const action of next) {
      if (action === "session-submit" || action === "session-interrupt" || action.startsWith("session-submit:") || action.startsWith("session-interrupt:")) {
        next.delete(action);
      }
      if (action.startsWith("session-delete:")) {
        next.delete(action);
      }
      if (action.startsWith("session-turn-delete:") || action.startsWith("session-branch:")) {
        next.delete(action);
      }
      if (action.startsWith("session-rename:")) {
        next.delete(action);
        renameFailed = true;
      }
    }
    pendingActionsRef.current = next;
    setPendingActions(next);
    updateActiveUi((current) => ({ ...current, pendingInitialRequest: undefined, pendingAttachRequest: undefined, chatMessages: withoutPendingUserChatMessages(current.chatMessages), sessionError: message.error, notice: message.error }));
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
    onTurnDeleted,
    onBranchCreated,
    onSessionEvent,
    onSessionCreated,
    onSessionAttached,
    onProtocolError,
    rejectActiveSessionRequest
  };
}
