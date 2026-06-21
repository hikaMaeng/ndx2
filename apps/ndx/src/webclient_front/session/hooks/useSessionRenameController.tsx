import React from "react";
import type { NDXAgentWebSession, NDXWebClientProject, NDXWebClientStateDocument } from "ndx/webclient/common";
import { listProjectSessions } from "ndx/webclient/front";
import { RSC } from "../../app/resource";
import { sendProjectSessionRename, type NDXSessionRenamedMessage } from "../../menu/project/socket/projectSocket";
import { SessionTitleDialog } from "../modals/SessionTitleDialog";

type UseSessionRenameControllerOptions = {
  finishAction: (key: string) => void;
  getSocket: () => WebSocket | undefined;
  hasPendingAction: (key: string) => boolean;
  setNotice: (message: string) => void;
  setProjectWarning: (message: string) => void;
  setProjectWarningTitle: (message: string) => void;
  setSessionsByProject: React.Dispatch<React.SetStateAction<Record<string, NDXAgentWebSession[]>>>;
  setStateSynced: (synced: boolean) => void;
  startAction: (key: string) => boolean;
  stateRef: React.MutableRefObject<NDXWebClientStateDocument>;
  t: Record<string, string>;
};

export function useSessionRenameController({ finishAction, getSocket, hasPendingAction, setNotice, setProjectWarning, setProjectWarningTitle, setSessionsByProject, setStateSynced, startAction, stateRef, t }: UseSessionRenameControllerOptions) {
  const [target, setTarget] = React.useState<{ project: NDXWebClientProject; session: NDXAgentWebSession }>();
  const [error, setError] = React.useState("");
  const renameSessionText = t[RSC.PROJECT_SESSION_RENAME_DIALOG_TITLE_TEXT] || "세션 이름 수정";
  const renameSessionFailedText = t[RSC.PROJECT_SESSION_RENAME_DIALOG_FAILED_ALERT] || "세션 이름 수정에 실패했습니다.";
  const renameSessionPendingText = t[RSC.PROJECT_SESSION_RENAME_DIALOG_PENDING_STATUS] || "세션 이름 수정 중";
  const renamedSessionText = t[RSC.PROJECT_SESSION_RENAME_DIALOG_SUCCESS_ALERT] || "세션 이름이 수정되었습니다.";

  const open = (project: NDXWebClientProject, session: NDXAgentWebSession) => {
    setError("");
    setTarget({ project, session });
  };

  const submit = (title: string) => {
    if (!target) return;
    const actionKey = `session-rename:${target.session.sessionid}`;
    if (!startAction(actionKey)) return;
    setError("");
    setNotice(renameSessionPendingText);
    if (!sendProjectSessionRename(getSocket(), {
      projectName: target.project.projectName,
      sessionid: target.session.sessionid,
      title
    })) {
      finishAction(actionKey);
      setError(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
      setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
    }
  };

  const applyRenamed = (message: NDXSessionRenamedMessage) => {
    finishAction(`session-rename:${message.sessionid}`);
    setTarget(undefined);
    setError("");
    setSessionsByProject((current) => ({
      ...current,
      [message.projectname]: (current[message.projectname] ?? []).map((session) => session.sessionid === message.sessionid ? { ...session, ...message } : session)
    }));
    const project = stateRef.current.projects.find((item) => item.projectName === message.projectname);
    if (project) {
      void listProjectSessions(project).then((sessions) => {
        setSessionsByProject((current) => ({ ...current, [project.projectName]: sessions }));
      }).catch(() => setStateSynced(false));
    }
    setNotice(renamedSessionText);
  };

  const applyProtocolErrorFailure = () => {
    setError(renameSessionFailedText);
    setTarget(undefined);
    setNotice(renameSessionFailedText);
    setProjectWarningTitle(renameSessionText);
    setProjectWarning(renameSessionFailedText);
  };

  const dialog = target ? <SessionTitleDialog busy={hasPendingAction(`session-rename:${target.session.sessionid}`)} error={error} session={target.session} t={t} onClose={() => { setTarget(undefined); setError(""); }} onRename={submit} /> : null;

  return { applyProtocolErrorFailure, applyRenamed, dialog, open };
}
