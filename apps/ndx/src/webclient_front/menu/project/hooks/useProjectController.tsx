import React from "react";
import type { NDXAgentWebMetadataResponse, NDXAgentWebSession, NDXAgentWebUser, NDXWebClientProject, NDXWebClientStateDocument } from "ndx/webclient/common";
import { createUser, deleteWebProject, listProjectSessions, listUsers, listWebProjects, openWebProjectInVSCode, updateProjectUser, createWebProject } from "ndx/webclient/front";
import { ProjectWarningDialog } from "../modals/ProjectWarningDialog";
import { UserDialog } from "../modals/UserDialog";
import type { NDXSessionDeletedMessage, NDXSessionListChangedMessage } from "../socket/projectSocket";
import { RSC } from "../../../app/resource";
import type { WebClientBridge } from "../../../app/bridge/WebClientBridge";

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
  projects: Array<{ projectName: string; userid: string }>,
  setSessionsByProject: React.Dispatch<React.SetStateAction<Record<string, NDXAgentWebSession[]>>>
) {
  const entries = await Promise.all(projects.map(async (project) => [project.projectName, await listProjectSessions(project).catch(() => [])] as const));
  setSessionsByProject(Object.fromEntries(entries));
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
  const [projectWarning, setProjectWarning] = React.useState("");
  const [projectWarningTitle, setProjectWarningTitle] = React.useState("");
  const [users, setUsers] = React.useState<NDXAgentWebUser[]>([]);
  const [sessionsByProject, setSessionsByProject] = React.useState<Record<string, NDXAgentWebSession[]>>({});
  const [expandedProjectSessionIds, setExpandedProjectSessionIds] = React.useState<Set<string>>(() => new Set());
  const [userModalProjectName, setUserModalProjectName] = React.useState<string>();
  const [newUserid, setNewUserid] = React.useState("");

  React.useEffect(() => {
    void refreshProjectSessions(clientState.projects, setSessionsByProject);
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
    return projects;
  };

  const selectProject = (project: NDXWebClientProject) => {
    clearSessionError();
    bridge?.openProject(project.projectName);
    saveState({ ...stateRef.current, activeProjectName: project.projectName, selectedUserid: project.userid });
  };

  const selectSession = (project: NDXWebClientProject, sessionid: string) => {
    clearSessionError();
    bridge?.openProjectSession(project.projectName, sessionid);
    saveState({ ...stateRef.current, activeProjectName: project.projectName, selectedUserid: project.userid });
  };

  const prepareSessionDraft = (project: NDXWebClientProject) => {
    bridge?.openProjectDraft(project.projectName);
    bridge?.openModal({ kind: "model", sourceSurfaceKey: `draft:${project.projectName}` });
    saveState({ ...stateRef.current, activeProjectName: project.projectName, selectedUserid: project.userid });
    clearSessionError();
  };

  const changeProjectUser = (project: NDXWebClientProject, userid: string) => {
    const actionKey = `project-user:${project.projectName}`;
    if (!startAction(actionKey)) return;
    void updateProjectUser(project.projectName, userid).then((row) => {
      const projects = stateRef.current.projects.map((item) => item.projectName === row.projectName ? { ...item, userid: row.userid } : item);
      saveState({ ...stateRef.current, projects, selectedUserid: row.userid });
      setUserModalProjectName(undefined);
      void refreshProjectSessions(projects, setSessionsByProject);
    }).catch(() => setNotice(t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT])).finally(() => finishAction(actionKey));
  };

  const deleteProject = (project: NDXWebClientProject) => {
    const actionKey = `project-delete:${project.projectName}`;
    if (!startAction(actionKey)) return;
    void (async () => {
      const row = await deleteWebProject(project.projectName);
      const deletedProjectName = row.projectName;
      setExpandedProjectSessionIds((current) => {
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

  const toggleProjectSessions = (projectname: string) => {
    setExpandedProjectSessionIds((current) => {
      const next = new Set(current);
      if (next.has(projectname)) {
        next.delete(projectname);
      } else {
        next.add(projectname);
      }
      return next;
    });
  };

  const openProjectInVSCode = (project: NDXWebClientProject) => {
    const actionKey = `project-vscode:${project.projectName}`;
    if (!startAction(actionKey)) return;
    void openWebProjectInVSCode(project.projectName)
      .catch((error) => {
        setNotice(error instanceof Error && error.message ? error.message : t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT]);
      })
      .finally(() => finishAction(actionKey));
  };

  const createAndSelectUser = (project: NDXWebClientProject) => {
    const actionKey = `user-create:${project.projectName}`;
    if (!startAction(actionKey)) return;
    const userid = newUserid.trim();
    if (!userid) {
      finishAction(actionKey);
      return;
    }
    void createUser({ userid }).then(() => listUsers()).then((data) => {
      setUsers(data.users);
      setNewUserid("");
      changeProjectUser(project, userid);
    }).catch(() => setNotice(t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT])).finally(() => finishAction(actionKey));
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
        name: folderName,
        userid: stateRef.current.selectedUserid ?? "ndev",
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
    const project = stateRef.current.projects.find((item) => item.projectName === message.projectname && item.userid === message.userid);
    if (project) {
      void listProjectSessions(project).then((sessions) => {
        setSessionsByProject((current) => ({ ...current, [project.projectName]: sessions }));
      }).catch(() => setStateSynced(false));
    }
    setNotice(t[RSC.PROJECT_SIDEBAR_SESSION_DELETED_ALERT]);
  };

  const reloadChangedSessionList = (message: NDXSessionListChangedMessage) => {
    const project = stateRef.current.projects.find((item) => item.projectName === message.projectname && item.userid === message.userid);
    if (!project) return;
    void listProjectSessions(project).then((sessions) => {
      setSessionsByProject((current) => ({ ...current, [project.projectName]: sessions }));
    }).catch(() => setStateSynced(false));
  };

  const userDialogProject = clientState.projects.find((project) => project.projectName === userModalProjectName);
  const dialogs = (
    <>
      {userDialogProject ? <UserDialog busy={hasPendingAction(`user-create:${userDialogProject.projectName}`) || hasPendingAction(`project-user:${userDialogProject.projectName}`)} newUserid={newUserid} project={userDialogProject} t={t} users={users} onClose={() => setUserModalProjectName(undefined)} onCreate={() => createAndSelectUser(userDialogProject)} onNewUseridChange={setNewUserid} onSelect={(userid) => changeProjectUser(userDialogProject, userid)} /> : null}
      {projectWarning ? <ProjectWarningDialog title={projectWarningTitle} message={projectWarning} t={t} onClose={() => { setProjectWarning(""); setProjectWarningTitle(""); }} /> : null}
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
    reloadProjectMenu,
    refreshSessions: () => refreshProjectSessions(stateRef.current.projects, setSessionsByProject),
    selectProject,
    selectSession,
    sessionsByProject,
    setProjectWarning,
    setProjectWarningTitle,
    setSessionsByProject,
    setUsers,
    toggleProjectSessions,
    openUserDialog: setUserModalProjectName
  };
}
