import React, { type ReactNode } from "react";
import type { NDXAgentWebMetadataResponse, NDXWebClientStateDocument } from "ndx/webclient/common";
import type { SocketState } from "ndx/webclient/front";
import { useBridgePendingActions, useBridgeSurface, type WebClientBridge } from "../../app/bridge/WebClientBridge";
import { ModalPortal } from "../../modal/ModalLayer";
import { WebClientSidebar } from "../components/WebClientSidebar";
import { useChatController } from "../chat/hooks/useChatController";
import { useProjectController } from "../project/hooks/useProjectController";
import { useProjectMenuInitialization } from "../project/hooks/useProjectMenuInitialization";

type MenuControllerProps = {
  bridge: WebClientBridge;
  children: ReactNode;
  clientid: string;
  clientState: NDXWebClientStateDocument;
  metadata: Partial<NDXAgentWebMetadataResponse>;
  saveState: (nextState: NDXWebClientStateDocument) => void;
  setClientState: React.Dispatch<React.SetStateAction<NDXWebClientStateDocument>>;
  setMetadata: React.Dispatch<React.SetStateAction<Partial<NDXAgentWebMetadataResponse>>>;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
  setSessionError: React.Dispatch<React.SetStateAction<string>>;
  setSessionStatus: React.Dispatch<React.SetStateAction<SocketState>>;
  setStateSynced: React.Dispatch<React.SetStateAction<boolean>>;
  stateRef: React.MutableRefObject<NDXWebClientStateDocument>;
  t: Record<string, string>;
  onChangeLanguage: () => void;
  onClose: () => void;
};

const MenuContext = React.createContext<((idSuffix: string) => ReactNode) | null>(null);

export function MenuController({
  bridge,
  children,
  clientid,
  clientState,
  metadata,
  saveState,
  setClientState,
  setMetadata,
  setNotice,
  setSessionError,
  setSessionStatus,
  setStateSynced,
  stateRef,
  t,
  onChangeLanguage,
  onClose
}: MenuControllerProps) {
  const surface = useBridgeSurface(bridge);
  const pendingActions = useBridgePendingActions(bridge);
  const hasPendingAction = (key: string) => pendingActions.has(key);
  const activeSessionId = surface.kind === "project-session" ? surface.sessionId : undefined;
  const activeChatFolderId = surface.kind === "chat-folder" || surface.kind === "chat-session" || surface.kind === "chat-draft" ? surface.folderId : undefined;
  const activeChatSessionId = surface.kind === "chat-session" ? surface.sessionId : undefined;
  const project = useProjectController({
    bridge,
    clientState,
    clearSessionError: () => setSessionError(""),
    finishAction: (key) => bridge.finishAction(key),
    hasPendingAction,
    metadata,
    saveState,
    setNotice,
    setStateSynced,
    startAction: (key) => bridge.startAction(key),
    stateRef,
    t
  });
  const chat = useChatController({
    bridge,
    finishAction: (key) => bridge.finishAction(key),
    startAction: (key) => bridge.startAction(key),
    setNotice
  });

  React.useEffect(() => bridge.registerProjectApi({
    applySessionDeleted: project.applySessionDeleted,
    reloadChangedSessionList: project.reloadChangedSessionList,
    refreshSessions: project.refreshSessions,
    setProjectWarning: project.setProjectWarning,
    setProjectWarningTitle: project.setProjectWarningTitle,
    setSessionsByProject: project.setSessionsByProject
  }), [bridge, project]);

  React.useEffect(() => {
    bridge.setProjectSessionsByProject(project.sessionsByProject);
  }, [bridge, project.sessionsByProject]);

  useProjectMenuInitialization({
    clientid,
    setMetadata,
    setClientState,
    setSessionsByProject: project.setSessionsByProject,
    setStateSynced,
    setSessionStatus
  });

  const openRenameModal: React.ComponentProps<typeof WebClientSidebar>["onRenameSession"] = (projectRow, session) => {
    bridge.openModal({ kind: "session-rename", projectName: projectRow.projectName, sessionId: session.sessionid });
  };
  const menu = (idSuffix: string) => (
    <WebClientSidebar activeSessionId={activeSessionId} activeChatFolderId={activeChatFolderId} activeChatSessionId={activeChatSessionId} idSuffix={idSuffix} chatFolders={chat.folders} chatSessionsByFolder={chat.sessionsByFolder} clientState={clientState} expandedProjectSessionIds={project.expandedProjectSessionIds} hasPendingAction={hasPendingAction} metadata={metadata} pinnedSessions={project.pinnedSessions} sessionsByProject={project.sessionsByProject} t={t} onChangeLanguage={onChangeLanguage} onClose={onClose} onAddChatFolder={chat.addFolder} onDeleteChatFolder={chat.removeFolder} onDeleteChatSession={chat.removeSession} onPrepareChatSessionDraft={chat.prepareSessionDraft} onRenameChatFolder={chat.renameFolder} onRenameChatSession={chat.renameSession} onSelectChatFolder={chat.selectFolder} onSelectChatSession={chat.selectSession} onPrepareSessionDraft={project.prepareSessionDraft} onDeleteProject={project.deleteProject} onDeleteSession={project.deleteSessionRow} onOpenProjectInVSCode={project.openProjectInVSCode} onOpenProjectPicker={project.openProjectPicker} onOpenSettings={() => { bridge.openSettings("models"); onClose(); }} onRenameSession={openRenameModal} onSelectProject={project.selectProject} onSelectSession={project.selectSession} onToggleSessionPin={project.toggleSessionPin} onToggleProjectSessions={project.toggleProjectSessions} />
  );

  return (
    <MenuContext.Provider value={menu}>
      {children}
      <ModalPortal>{project.dialogs}</ModalPortal>
    </MenuContext.Provider>
  );
}

export function MenuPane({ idSuffix }: { idSuffix: string }) {
  const menu = React.useContext(MenuContext);
  return <>{menu?.(idSuffix)}</>;
}
