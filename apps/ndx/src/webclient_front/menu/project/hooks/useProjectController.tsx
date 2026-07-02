import React from "react";
import type { NDXAgentWebMetadataResponse, NDXAgentWebPinnedSession, NDXAgentWebSession, NDXWebClientProject, NDXWebClientStateDocument } from "ndx/webclient/common";
import { deleteWebProject, getProjectMenuModel, listPinnedSessions, listProjectSessions, listWebProjects, vscodeFileUriForPath, createWebProject, pinSession, unpinSession } from "ndx/webclient/front";
import { ProjectWarningDialog } from "../modals/ProjectWarningDialog";
import type { NDXSessionDeletedMessage, NDXSessionListChangedMessage } from "../socket/projectSocket";
import { RSC } from "../../../app/resource";
import type { WebClientBridge } from "../../../app/bridge/WebClientBridge";
import { useModel } from "../../../model/useModel";

type UseProjectControllerOptions = {
  bridge?: WebClientBridge;
  clientState: NDXWebClientStateDocument;
  clearSessionError: () => void;
  finishAction: (key: string) => void;
  hasPendingAction: (key: string) => boolean;
  metadata: Partial<NDXAgentWebMetadataResponse>;
  saveState: (nextState: NDXWebClientStateDocument) => void;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
  setStateSynced: React.Dispatch<React.SetStateAction<boolean>>;
  startAction: (key: string) => boolean;
  stateRef: React.MutableRefObject<NDXWebClientStateDocument>;
  t: Record<string, string>;
};

export async function refreshProjectSessions(
  projects: Array<{ projectName: string }>,
  setSessionsByProject: React.Dispatch<React.SetStateAction<Record<string, NDXAgentWebSession[]>>>
) {
  const entries = await Promise.all(projects.map(async (project) => [project.projectName, await listProjectSessions(project).catch(() => [])] as const));
  setSessionsByProject(Object.fromEntries(entries));
}

export async function refreshPinnedSessions(
  setPinnedSessions: React.Dispatch<React.SetStateAction<NDXAgentWebPinnedSession[]>>
) {
  setPinnedSessions(await listPinnedSessions().catch(() => []));
}

export function useProjectController({
  bridge,
  clientState,
  clearSessionError,
  finishAction,
  hasPendingAction,
  metadata,
  saveState,
  setNotice,
  setStateSynced,
  startAction,
  stateRef,
  t
}: UseProjectControllerOptions) {
  const model = getProjectMenuModel();
  const projectWarning = useModel(model.projectWarning).value;
  const projectWarningTitle = useModel(model.projectWarningTitle).value;
  const pinnedSessions = useModel(model.pinnedSessions).value;
  const sessionsByProject = useModel(model.sessionsByProject).value;
  const expandedProjectSessionIds = useModel(model.expandedProjectSessionIds).value;
  const setProjectWarning = React.useCallback((update: React.SetStateAction<string>) => model.projectWarning.set(update), [model]);
  const setProjectWarningTitle = React.useCallback((update: React.SetStateAction<string>) => model.projectWarningTitle.set(update), [model]);
  const setPinnedSessions = React.useCallback((update: React.SetStateAction<NDXAgentWebPinnedSession[]>) => model.pinnedSessions.set(update), [model]);
  const setSessionsByProject = React.useCallback((update: React.SetStateAction<Record<string, NDXAgentWebSession[]>>) => model.sessionsByProject.set(update), [model]);

  React.useEffect(() => {
    void refreshProjectSessions(clientState.projects, setSessionsByProject);
    void refreshPinnedSessions(setPinnedSessions);
  }, [clientState.projects]);

  const reloadProjectMenu = async (preferredActiveProjectName?: string) => {
    const projects = await listWebProjects();
    const activeProjectName =
      preferredActiveProjectName && projects.some((project) => project.projectName === preferredActiveProjectName)
        ? preferredActiveProjectName
        : stateRef.current.activeProjectName && projects.some((project) => project.projectName === stateRef.current.activeProjectName)
          ? stateRef.current.activeProjectName
          : projects[0]?.projectName;
    const nextState: NDXWebClientStateDocument = { ...stateRef.current, projects };
    if (activeProjectName) {
      nextState.activeProjectName = activeProjectName;
    } else {
      delete nextState.activeProjectName;
    }
    if (nextState.lastSession && !projects.some((project) => project.projectName === nextState.lastSession?.projectName)) {
      delete nextState.lastSession;
    }
    saveState(nextState);
    await refreshProjectSessions(projects, setSessionsByProject);
    await refreshPinnedSessions(setPinnedSessions);
    return projects;
  };

  const selectProject = (project: NDXWebClientProject) => {
    clearSessionError();
    bridge?.openProject(project.projectName);
    saveState({ ...stateRef.current, activeProjectName: project.projectName });
  };

  const selectSession = (project: NDXWebClientProject, sessionid: string) => {
    clearSessionError();
    bridge?.openProjectSession(project.projectName, sessionid);
    saveState({ ...stateRef.current, activeProjectName: project.projectName });
  };

  const prepareSessionDraft = (project: NDXWebClientProject) => {
    bridge?.openProjectDraft(project.projectName);
    bridge?.openModal({ kind: "model", sourceSurfaceKey: `draft:${project.projectName}` });
    saveState({ ...stateRef.current, activeProjectName: project.projectName });
    clearSessionError();
  };

  const deleteProject = (project: NDXWebClientProject) => {
    const actionKey = `project-delete:${project.projectName}`;
    if (!startAction(actionKey)) return;
    void (async () => {
      const row = await deleteWebProject(project.projectName);
      const deletedProjectName = row.projectName;
      model.expandedProjectSessionIds.set((current) => {
        const next = new Set(current);
        next.delete(deletedProjectName);
        return next;
      });
      const surface = bridge?.getSnapshot().surface;
      if (surface?.kind === "project" && surface.projectName === deletedProjectName || surface?.kind === "project-draft" && surface.projectName === deletedProjectName || surface?.kind === "project-session" && surface.projectName === deletedProjectName) {
        bridge?.clearSurface();
      }
      setNotice(t[RSC.PROJECT_SIDEBAR_PROJECT_DELETED_ALERT]);
      await reloadProjectMenu();
    })().catch(() => setNotice(t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT])).finally(() => finishAction(actionKey));
  };

  const deleteSessionRow = (project: NDXWebClientProject, session: NDXAgentWebSession) => {
    const actionKey = `session-delete:${session.sessionid}`;
    if (!startAction(actionKey)) return;
    setNotice(t[RSC.PROJECT_SIDEBAR_SESSION_DELETE_PENDING_STATUS]);
    clearSessionError();
    const surface = bridge?.getSnapshot().surface;
    if (surface?.kind === "project-session" && surface.sessionId === session.sessionid) {
      bridge?.openProject(project.projectName);
    }
    if (bridge) {
      bridge.requestProjectSessionDelete(project, session);
    } else {
      finishAction(actionKey);
      setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
    }
  };

  const toggleSessionPin = (project: NDXWebClientProject, session: NDXAgentWebSession) => {
    const actionKey = `session-pin:${session.sessionid}`;
    if (!startAction(actionKey)) return;
    void (async () => {
      if (model.pinnedSessions.value.some((item) => item.sessionid === session.sessionid)) {
        await unpinSession(session.sessionid);
      } else {
        await pinSession(session.sessionid);
      }
      await refreshPinnedSessions(setPinnedSessions);
      const pinnedProject = stateRef.current.projects.find((item) => item.projectName === project.projectName);
      if (pinnedProject) {
        const sessions = await listProjectSessions(pinnedProject);
        setSessionsByProject((current) => ({ ...current, [pinnedProject.projectName]: sessions }));
      }
    })().catch((error) => {
      setNotice(error instanceof Error && error.message ? error.message : t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT]);
    }).finally(() => finishAction(actionKey));
  };

  const toggleProjectSessions = (projectname: string) => {
    model.toggleProjectSessions(projectname);
  };

  const openProjectInVSCode = (project: NDXWebClientProject) => {
    window.location.assign(vscodeFileUriForPath(project.path, metadata.workspace));
  };

  const openProjectPicker = () => {
    if (!startAction("project-add")) return;
    void (async () => {
      const folderName = window.prompt("새 프로젝트 폴더명")?.trim() ?? "";
      if (!folderName) {
        setProjectWarningTitle(t[RSC.APP_PROJECT_WARNING_TITLE_TEXT]);
        setProjectWarning(t[RSC.APP_PROJECT_PICKER_FOLDER_REQUIRED_ALERT]);
        return;
      }

      const project = await createWebProject({
        name: folderName
      });
      await reloadProjectMenu(project.projectName);
      setNotice(t[RSC.PROJECT_SIDEBAR_PROJECTS_ADDED_ALERT]);
    })().catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const message = error instanceof Error && error.message ? error.message : t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT];
        setProjectWarningTitle(t[RSC.APP_PROJECT_WARNING_TITLE_TEXT]);
        setProjectWarning(message);
      }
    }).finally(() => finishAction("project-add"));
  };

  const applySessionDeleted = (message: NDXSessionDeletedMessage) => {
    finishAction(`session-delete:${message.sessionid}`);
    setSessionsByProject((current) => ({
      ...current,
      [message.projectname]: (current[message.projectname] ?? []).filter((session) => session.sessionid !== message.sessionid)
    }));
    setPinnedSessions((current) => current.filter((session) => session.sessionid !== message.sessionid));
    const project = stateRef.current.projects.find((item) => item.projectName === message.projectname);
    if (project) {
      void listProjectSessions(project).then((sessions) => {
        setSessionsByProject((current) => ({ ...current, [project.projectName]: sessions }));
      }).catch(() => setStateSynced(false));
    }
    setNotice(t[RSC.PROJECT_SIDEBAR_SESSION_DELETED_ALERT]);
  };

  const reloadChangedSessionList = (message: NDXSessionListChangedMessage) => {
    const project = stateRef.current.projects.find((item) => item.projectName === message.projectname);
    if (!project) return;
    void listProjectSessions(project).then((sessions) => {
      setSessionsByProject((current) => ({ ...current, [project.projectName]: sessions }));
    }).catch(() => setStateSynced(false));
  };

  const dialogs = (
    <>
      {projectWarning ? <ProjectWarningDialog title={projectWarningTitle} message={projectWarning} t={t} onClose={() => model.closeProjectWarning()} /> : null}
    </>
  );

  return {
    dialogs,
    expandedProjectSessionIds,
    applySessionDeleted,
    reloadChangedSessionList,
    openProjectInVSCode,
    openProjectPicker,
    prepareSessionDraft,
    deleteProject,
    deleteSessionRow,
    pinnedSessions,
    reloadProjectMenu,
    refreshSessions: async () => {
      await refreshProjectSessions(stateRef.current.projects, setSessionsByProject);
      await refreshPinnedSessions(setPinnedSessions);
    },
    selectProject,
    selectSession,
    sessionsByProject,
    setProjectWarning,
    setProjectWarningTitle,
    setSessionsByProject,
    toggleSessionPin,
    toggleProjectSessions
  };
}
