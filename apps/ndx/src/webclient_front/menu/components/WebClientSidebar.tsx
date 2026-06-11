import type { NDXAgentWebChatFolder, NDXAgentWebChatSession, NDXAgentWebMetadataResponse, NDXAgentWebSession, NDXWebClientProject, NDXWebClientStateDocument } from "ndx/webclient/common";
import { ChatSidebar } from "../chat/components/ChatSidebar";
import { ProjectSidebar } from "../project/components/Sidebar";
import { Sidebar as MenuSidebar } from "./Sidebar";

type WebClientSidebarProps = {
  activeSessionId?: string;
  activeChatFolderId?: string;
  activeChatSessionId?: string;
  chatFolders: NDXAgentWebChatFolder[];
  clientState: NDXWebClientStateDocument;
  expandedProjectSessionIds: Set<string>;
  hasPendingAction: (key: string) => boolean;
  idSuffix: string;
  metadata: Partial<NDXAgentWebMetadataResponse>;
  sessionsByProject: Record<string, NDXAgentWebSession[]>;
  chatSessionsByFolder: Record<string, NDXAgentWebChatSession[]>;
  t: Record<string, string>;
  onChangeLanguage: () => void;
  onAddChatFolder: () => void;
  onDeleteChatFolder: (folder: NDXAgentWebChatFolder) => void;
  onDeleteChatSession: (session: NDXAgentWebChatSession) => void;
  onClose: () => void;
  onDeleteProject: (project: NDXWebClientProject) => void;
  onDeleteSession: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onOpenProjectInVSCode: (project: NDXWebClientProject) => void;
  onOpenProjectPicker: () => void;
  onOpenSettings: () => void;
  onPrepareChatSessionDraft: (folder: NDXAgentWebChatFolder) => void;
  onOpenUserDialog: (projectname: string) => void;
  onPrepareSessionDraft: (project: NDXWebClientProject) => void;
  onRenameSession: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onRenameChatFolder: (folder: NDXAgentWebChatFolder) => void;
  onRenameChatSession: (session: NDXAgentWebChatSession) => void;
  onSelectProject: (project: NDXWebClientProject) => void;
  onSelectSession: (project: NDXWebClientProject, sessionid: string) => void;
  onSelectChatFolder: (folder: NDXAgentWebChatFolder) => void;
  onSelectChatSession: (session: NDXAgentWebChatSession) => void;
  onToggleProjectSessions: (projectname: string) => void;
};

export function WebClientSidebar({
  activeSessionId,
  activeChatFolderId,
  activeChatSessionId,
  chatFolders,
  clientState,
  expandedProjectSessionIds,
  hasPendingAction,
  idSuffix,
  metadata,
  sessionsByProject,
  chatSessionsByFolder,
  t,
  onChangeLanguage,
  onAddChatFolder,
  onDeleteChatFolder,
  onDeleteChatSession,
  onClose,
  onDeleteProject,
  onDeleteSession,
  onOpenProjectInVSCode,
  onOpenProjectPicker,
  onOpenSettings,
  onPrepareChatSessionDraft,
  onOpenUserDialog,
  onPrepareSessionDraft,
  onRenameSession,
  onRenameChatFolder,
  onRenameChatSession,
  onSelectProject,
  onSelectSession,
  onSelectChatFolder,
  onSelectChatSession,
  onToggleProjectSessions
}: WebClientSidebarProps) {
  const pendingProjectIds = new Set(clientState.projects.filter((project) => hasPendingAction(`project-delete:${project.projectName}`) || hasPendingAction(`project-user:${project.projectName}`) || hasPendingAction(`project-vscode:${project.projectName}`)).map((project) => project.projectName));
  const pendingSessionIds = new Set(Object.values(sessionsByProject).flat().filter((session) => hasPendingAction(`session-delete:${session.sessionid}`) || hasPendingAction(`session-rename:${session.sessionid}`)).map((session) => session.sessionid));
  const pendingChatFolderIds = new Set(chatFolders.filter((folder) => hasPendingAction(`chat-folder-delete:${folder.folderid}`) || hasPendingAction(`chat-folder-rename:${folder.folderid}`)).map((folder) => folder.folderid));
  const pendingChatSessionIds = new Set(Object.values(chatSessionsByFolder).flat().filter((session) => hasPendingAction(`chat-session-delete:${session.chatsessionid}`) || hasPendingAction(`chat-session-rename:${session.chatsessionid}`)).map((session) => session.chatsessionid));

  return (
    <MenuSidebar metadata={metadata} t={t} onChangeLanguage={onChangeLanguage} onClose={onClose} onOpenSettings={onOpenSettings}>
      <ProjectSidebar activeSessionId={activeSessionId} idSuffix={idSuffix} clientState={clientState} pendingProjectIds={pendingProjectIds} pendingSessionIds={pendingSessionIds} expandedProjectSessionIds={expandedProjectSessionIds} sessionsByProject={sessionsByProject} t={t} onPrepareSessionDraft={onPrepareSessionDraft} onDeleteProject={onDeleteProject} onDeleteSession={onDeleteSession} onOpenProjectInVSCode={onOpenProjectInVSCode} onOpenProjectPicker={onOpenProjectPicker} onRenameSession={onRenameSession} onOpenUserDialog={onOpenUserDialog} onSelectProject={onSelectProject} onSelectSession={onSelectSession} onToggleProjectSessions={onToggleProjectSessions} />
      <ChatSidebar activeFolderId={activeChatFolderId} activeSessionId={activeChatSessionId} folders={chatFolders} pendingFolderIds={pendingChatFolderIds} pendingSessionIds={pendingChatSessionIds} sessionsByFolder={chatSessionsByFolder} onAddFolder={onAddChatFolder} onDeleteFolder={onDeleteChatFolder} onDeleteSession={onDeleteChatSession} onPrepareSessionDraft={onPrepareChatSessionDraft} onRenameFolder={onRenameChatFolder} onRenameSession={onRenameChatSession} onSelectFolder={onSelectChatFolder} onSelectSession={onSelectChatSession} />
    </MenuSidebar>
  );
}
