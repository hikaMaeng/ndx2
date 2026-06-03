import React from "react";
import type { UseSessionSocketControllerOptions, SessionSocketControllerActions } from "./types";

export function useSessionSocketCommands({
  activeSessionIdRef,
  sessionTokensRef,
  setTurnFlows,
  socketRef,
  socketState
}: UseSessionSocketControllerOptions): SessionSocketControllerActions {
  const requestedTurnDetailsRef = React.useRef<Set<string>>(new Set());
  const requestedIterationDetailsRef = React.useRef<Set<string>>(new Set());

  const attachSession: SessionSocketControllerActions["attachSession"] = (session) => {
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

  const toggleTurnDetail: SessionSocketControllerActions["toggleTurnDetail"] = (turn, open) => {
    setTurnFlows((turns) => turns.map((current) => current.id === turn.id ? { ...current, collapsed: !open } : current));
    if (!open) return;
    const key = `${turn.sessionid}:${turn.inputDataId}`;
    if (requestedTurnDetailsRef.current.has(key)) return;
    const token = sessionTokensRef.current[turn.sessionid];
    if (!token || !socketRef.current?.requestTurnDetail(token, turn.inputDataId)) return;
    requestedTurnDetailsRef.current.add(key);
  };

  const toggleIterationDetail: SessionSocketControllerActions["toggleIterationDetail"] = (turn, iteration, open, userInitiated = true) => {
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

  return {
    attachSession,
    refreshSkillList,
    toggleIterationDetail,
    toggleTurnDetail
  };
}
