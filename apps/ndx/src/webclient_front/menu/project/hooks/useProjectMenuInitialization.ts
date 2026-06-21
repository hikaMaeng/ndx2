import React from "react";
import { normalizeWebClientState, type NDXAgentWebMetadataResponse, type NDXAgentWebSession, type NDXWebClientStateDocument } from "ndx/webclient/common";
import { getMetadata, getWebClientState, listWebProjects } from "ndx/webclient/front";
import { refreshProjectSessions } from "./useProjectController";

export function useProjectMenuInitialization(input: {
  clientid: string;
  setMetadata: React.Dispatch<React.SetStateAction<Partial<NDXAgentWebMetadataResponse>>>;
  setClientState: React.Dispatch<React.SetStateAction<NDXWebClientStateDocument>>;
  setSessionsByProject: React.Dispatch<React.SetStateAction<Record<string, NDXAgentWebSession[]>>>;
  setStateSynced: React.Dispatch<React.SetStateAction<boolean>>;
  setSessionStatus: React.Dispatch<React.SetStateAction<"checking" | "idle" | "connecting" | "negotiating" | "connected" | "ready" | "offline" | "error">>;
}) {
  const { clientid, setMetadata, setClientState, setSessionsByProject, setStateSynced, setSessionStatus } = input;

  React.useEffect(() => {
    let cancelled = false;

    void Promise.all([getMetadata(), getWebClientState(clientid), listWebProjects()])
      .then(async ([meta, state, projects]) => {
        if (cancelled) return;
        setMetadata(meta);
        const normalizedState = normalizeWebClientState({ ...state.state, projects, activeProjectName: state.state.activeProjectName });
        setClientState(normalizedState);
        setStateSynced(true);
        void refreshProjectSessions(projects, setSessionsByProject);
        const health = await fetch(meta.session.healthUrl);
        if (!cancelled) setSessionStatus(health.ok ? "ready" : "offline");
      })
      .catch(() => {
        if (!cancelled) {
          setStateSynced(false);
          setSessionStatus("offline");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientid, setClientState, setMetadata, setSessionStatus, setSessionsByProject, setStateSynced]);
}
