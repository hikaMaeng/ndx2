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
  interruptWasAccepted,
  withoutPendingUserChatMessages,
  type NDXAgentWebContextUsage
} from "ndx/webclient/front";
import { RSC } from "../../../app/resource";
import { rightSidebarCleared } from "../../rightsidebar/state";
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
    applyRoutedSessionMessage,
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

  const clearSessionRequestActions = (sessionid: string) => {
    setPendingActions((current) => {
      const next = new Set(current);
      next.delete("session-submit");
      next.delete("session-interrupt");
      next.delete(`session-submit:${sessionid}`);
      next.delete(`session-interrupt:${sessionid}`);
      pendingActionsRef.current = next;
      return next;
    });
  };

  const onHistorySummary = (message: NDXSessionHistorySummaryResultMessage) => {
    if (message.sessionid !== activeSessionIdRef.current) return;
    updateContextUsage(message.contextUsage);
    applyRoutedSessionMessage(message, eventText());
  };

  const onSkillList = (message: NDXSessionSkillListResultMessage) => {
    const projectName = message.projectName || activeSession?.projectname || draftSessionProjectIdRef.current || stateRef.current.activeProjectName;
    if (!projectName) return;
    onSkillListReceived(projectName, message.skills);
  };

  const onSidebarItem = (message: NDXSessionSidebarItemMessage) => {
    applyRoutedSessionMessage(message, eventText());
  };

  const onTurnDetail = (message: NDXSessionTurnDetailResultMessage) => {
    if (message.sessionid !== activeSessionIdRef.current || !message.turn) return;
    applyRoutedSessionMessage(message, eventText());
  };

  const onIterationDetail = (message: NDXSessionIterationDetailResultMessage) => {
    if (message.sessionid !== activeSessionIdRef.current) return;
    applyRoutedSessionMessage(message, eventText());
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
    const compactRunning = message.compactStatus === "running";
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
      agentRunning: compactRunning,
      compactRunning,
      notice: compactRunning ? "분기 세션 compact 진행 중..." : "분기 세션을 생성했습니다.",
      sessionError: "",
      chatMessages: [],
      turnFlows: []
    }));
    project.openProjectSession(session.projectname, session.sessionid);
    if (!compactRunning) {
      socketRef.current?.requestHistorySummary(session.sessionid);
    }
    socketRef.current?.requestSkillList(session.sessionid);
    void project.refreshSessions();
  };

  const onSessionEvent = (message: NDXSessionEventMessage) => {
    clearSessionError();
    liveSessionIdsRef.current.add(message.sessionid);
    const isActiveSessionEvent = message.sessionid === activeSessionIdRef.current;
    const interruptRejectedOrStored = message.event === NDX_TURN_EVENT.Interrupted && !interruptWasAccepted(message.contents);
    const sessionRunningState = message.sessionState?.isrunning;
    if (message.event === NDX_TURN_EVENT.AssistantRecorded || message.event === NDX_TURN_EVENT.TurnEnd) {
      clearSessionRequestActions(message.sessionid);
    }
    if (message.event === NDX_TURN_EVENT.InterruptCompleted) {
      clearSessionRequestActions(message.sessionid);
    }
    if (interruptRejectedOrStored) {
      clearSessionRequestActions(message.sessionid);
    }
    if (typeof sessionRunningState === "boolean") {
      project.setSessionsByProject((current) => {
        let changed = false;
        const next = Object.fromEntries(Object.entries(current).map(([projectName, sessions]) => [
          projectName,
          sessions.map((session) => {
            if (session.sessionid !== message.sessionid || session.isrunning === sessionRunningState) return session;
            changed = true;
            return { ...session, isrunning: sessionRunningState };
          })
        ]));
        return changed ? next : current;
      });
    }

    applyRoutedSessionMessage(message, eventText());
    if (isActiveSessionEvent && message.event === NDX_TURN_EVENT.CompactCompleted && message.contents && typeof message.contents === "object" && (message.contents as { kind?: unknown; reason?: unknown }).kind === "compact_completed" && (message.contents as { reason?: unknown }).reason === "branch") {
      socketRef.current?.requestHistorySummary(message.sessionid);
    }
    if (!isActiveSessionEvent || message.event === NDX_TURN_EVENT.InputRecorded || message.event === NDX_TURN_EVENT.AssistantRecorded || sessionRunningState === false) {
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

  const eventText = () => ({
    compactCompleted: "세션 히스토리 compact 완료",
    compactStarted: "세션 히스토리 compact 진행 중...",
    interruptPending: t[RSC.SESSION_COMPOSER_INTERRUPT_PENDING_STATUS],
    interruptStored: t[RSC.APP_STATUS_INTERRUPT_STORED_STATUS],
    operationInProgress: t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] || "응답 수신 중...",
    prefixDrift: "Prefix drift warning",
    requestStored: t[RSC.APP_STATUS_REQUEST_STORED_STATUS]
  });

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
