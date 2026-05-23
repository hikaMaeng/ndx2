import React from "react";
import { normalizeWebClientState, type NDXAgentWebMetadataResponse, type NDXAgentWebSession, type NDXAgentWebUser, type NDXWebClientStateDocument } from "ndx/agent/web";
import { getMetadata, getWebClientState } from "../api/appBackendApi";
import { listProjectSessions, listUsers, listWebProjects } from "../../project/api/projectBackendApi";

export function useAppInitialization(input: {
  clientid: string;
  setMetadata: React.Dispatch<React.SetStateAction<Partial<NDXAgentWebMetadataResponse>>>;
  setClientState: React.Dispatch<React.SetStateAction<NDXWebClientStateDocument>>;
  setUsers: React.Dispatch<React.SetStateAction<NDXAgentWebUser[]>>;
  setSessionsByProject: React.Dispatch<React.SetStateAction<Record<string, NDXAgentWebSession[]>>>;
  setStateSynced: React.Dispatch<React.SetStateAction<boolean>>;
  setSessionStatus: React.Dispatch<React.SetStateAction<"checking" | "idle" | "connecting" | "negotiating" | "connected" | "ready" | "offline" | "error">>;
}) {
  const { clientid, setMetadata, setClientState, setUsers, setSessionsByProject, setStateSynced, setSessionStatus } = input;

  React.useEffect(() => {
    let cancelled = false;

    void Promise.all([getMetadata(), getWebClientState(clientid), listWebProjects(), listUsers()])
      .then(async ([meta, state, projects, userData]) => {
        if (cancelled) return;
        setMetadata(meta);
        const normalizedState = normalizeWebClientState({ ...state.state, projects, activeProjectId: state.state.activeProjectId });
        setClientState(normalizedState);
        setUsers(userData.users);
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
  }, [clientid, setClientState, setMetadata, setSessionStatus, setSessionsByProject, setStateSynced, setUsers]);
}

export async function refreshProjectSessions(
  projects: Array<{ id: string; userid: string }>,
  setSessionsByProject: React.Dispatch<React.SetStateAction<Record<string, NDXAgentWebSession[]>>>
) {
  const entries = await Promise.all(projects.map(async (project) => [project.id, await listProjectSessions(project).catch(() => [])] as const));
  setSessionsByProject(Object.fromEntries(entries));
}
