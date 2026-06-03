import React from "react";
import { applyProjectSocketMessage } from "../../../menu/project/socket/projectSocket";
import { openSessionSocket } from "../../socket/sessionSocket";
import type { SessionSocketControllerActions, UseSessionSocketControllerOptions } from "./types";
import type { SessionSocketHandlers } from "./sessionSocketHandlers";

type UseSessionSocketLifecycleRuntime = {
  attachSession: SessionSocketControllerActions["attachSession"];
  handlers: SessionSocketHandlers;
  liveSessionIdsRef: React.MutableRefObject<Set<string>>;
};

export function useSessionSocketLifecycle(options: UseSessionSocketControllerOptions, runtime: UseSessionSocketLifecycleRuntime) {
  const {
    activeSession,
    activeSessionId,
    clientid,
    draftSessionProjectId,
    metadata,
    project,
    saveState,
    sessionRename,
    sessionTokensRef,
    setDraftSessionProjectId,
    setLastProtocolEvent,
    setNotice,
    setSessionTokens,
    setSocketState,
    socketRef,
    socketState,
    stateRef,
    t,
    onClientRequest,
    onClientRequestClosed
  } = options;
  const { attachSession, handlers, liveSessionIdsRef } = runtime;

  React.useEffect(() => {
    if (!activeSessionId) {
      return;
    }
    setDraftSessionProjectId(undefined);
    const token = sessionTokensRef.current[activeSessionId];
    if (token) {
      const requestedHistory = Boolean(socketRef.current?.requestHistorySummary(token));
      socketRef.current?.requestSkillList(token);
      if (requestedHistory) return;
    }
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
      onSessionCreated: handlers.onSessionCreated,
      onSessionAttached: handlers.onSessionAttached,
      onSessionEvent: handlers.onSessionEvent,
      onHistorySummary: handlers.onHistorySummary,
      onSkillList: handlers.onSkillList,
      onSidebarItem: handlers.onSidebarItem,
      onTurnDetail: handlers.onTurnDetail,
      onIterationDetail: handlers.onIterationDetail,
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
      onProtocolError: handlers.onProtocolError,
      onTransportError: handlers.rejectActiveSessionRequest
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
}
