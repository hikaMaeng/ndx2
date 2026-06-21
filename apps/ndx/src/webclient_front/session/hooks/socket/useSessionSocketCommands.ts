import React from "react";
import type { UseSessionSocketControllerOptions, SessionSocketControllerActions } from "./types";

export function useSessionSocketCommands({
  activeSessionIdRef,
  attachedSessionIdsRef,
  draftSessionProjectIdRef,
  setTurnFlows,
  socketRef,
  socketState,
  updateActiveUi
}: UseSessionSocketControllerOptions): SessionSocketControllerActions {
  const requestedTurnDetailsRef = React.useRef<Set<string>>(new Set());
  const requestedIterationDetailsRef = React.useRef<Set<string>>(new Set());

  const attachSession: SessionSocketControllerActions["attachSession"] = (session) => {
    if (attachedSessionIdsRef.current.has(session.sessionid)) return true;
    if (socketState !== "connected" || !socketRef.current?.isOpen()) return false;
    return Boolean(socketRef.current?.attachSession({
      userid: session.userid,
      projectName: session.projectname,
      sessionid: session.sessionid
    }));
  };

  const refreshSkillList = () => {
    const sessionid = activeSessionIdRef.current;
    const attachedSessionid = sessionid && attachedSessionIdsRef.current.has(sessionid) ? sessionid : undefined;
    const requested = Boolean(socketRef.current?.requestSkillList(attachedSessionid, attachedSessionid ? undefined : draftSessionProjectIdRef.current));
    if (requested) {
      updateActiveUi((current) => ({ ...current, availableSkills: [] }));
    }
    return requested;
  };

  const deleteTurn: SessionSocketControllerActions["deleteTurn"] = (sessionid, inputDataId) => {
    if (!attachedSessionIdsRef.current.has(sessionid) || !socketRef.current?.isOpen()) return false;
    return Boolean(socketRef.current.deleteTurn(sessionid, inputDataId));
  };

  const createBranch: SessionSocketControllerActions["createBranch"] = (sessionid, inputDataId) => {
    if (!attachedSessionIdsRef.current.has(sessionid) || !socketRef.current?.isOpen()) return false;
    return Boolean(socketRef.current.createBranch(sessionid, inputDataId));
  };

  const toggleTurnDetail: SessionSocketControllerActions["toggleTurnDetail"] = (turn, open) => {
    setTurnFlows((turns) => turns.map((current) => current.id === turn.id ? { ...current, collapsed: !open } : current));
    if (!open) return;
    const key = `${turn.sessionid}:${turn.inputDataId}`;
    if (requestedTurnDetailsRef.current.has(key)) return;
    if (!attachedSessionIdsRef.current.has(turn.sessionid) || !socketRef.current?.requestTurnDetail(turn.sessionid, turn.inputDataId)) return;
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
    if (!attachedSessionIdsRef.current.has(turn.sessionid) || !socketRef.current?.requestIterationDetail(turn.sessionid, turn.inputDataId, iteration.iteration)) return;
    requestedIterationDetailsRef.current.add(key);
  };

  return {
    attachSession,
    createBranch,
    deleteTurn,
    refreshSkillList,
    toggleIterationDetail,
    toggleTurnDetail
  };
}
