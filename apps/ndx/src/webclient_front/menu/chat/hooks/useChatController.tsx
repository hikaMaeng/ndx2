import React from "react";
import type { NDXAgentWebChatFolder, NDXAgentWebChatSession } from "ndx/webclient/common";
import { createChatFolder, deleteChatFolder, deleteChatSession, getChatMenuModel, listChatFolders, listChatSessions, updateChatFolder, updateChatSession } from "ndx/webclient/front";
import type { WebClientBridge } from "../../../app/bridge/WebClientBridge";
import { useModel } from "../../../model/useModel";

type UseChatControllerOptions = {
  bridge?: WebClientBridge;
  finishAction: (key: string) => void;
  startAction: (key: string) => boolean;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
};

export function useChatController({ bridge, finishAction, startAction, setNotice }: UseChatControllerOptions) {
  const model = getChatMenuModel();
  const folders = useModel(model.folders).value;
  const sessionsByFolder = useModel(model.sessionsByFolder).value;

  const refreshChat = async () => {
    const nextFolders = (await listChatFolders()).folders;
    model.folders.set(nextFolders);
    const entries = await Promise.all(nextFolders.map(async (folder) => [folder.folderid, (await listChatSessions(folder.folderid)).sessions] as const));
    model.sessionsByFolder.set(Object.fromEntries(entries));
  };

  React.useEffect(() => {
    void refreshChat().catch(() => setNotice("채팅 목록을 불러오지 못했습니다."));
  }, []);

  React.useEffect(() => {
    const refresh = () => {
      void refreshChat().catch(() => setNotice("채팅 목록을 불러오지 못했습니다."));
    };
    window.addEventListener("ndx-chat-refresh", refresh);
    return () => window.removeEventListener("ndx-chat-refresh", refresh);
  }, []);

  const addFolder = () => {
    const title = window.prompt("채팅 폴더 이름");
    if (!title?.trim()) return;
    const key = "chat-folder-add";
    if (!startAction(key)) return;
    void createChatFolder({ title }).then(refreshChat).catch((error) => {
      setNotice(error instanceof Error && error.message ? error.message : "채팅 폴더를 만들지 못했습니다.");
    }).finally(() => finishAction(key));
  };

  const renameFolder = (folder: NDXAgentWebChatFolder) => {
    const title = window.prompt("채팅 폴더 이름", folder.title);
    if (!title?.trim() || title.trim() === folder.title) return;
    const key = `chat-folder-rename:${folder.folderid}`;
    if (!startAction(key)) return;
    void updateChatFolder(folder.folderid, { title }).then(refreshChat).catch((error) => {
      setNotice(error instanceof Error && error.message ? error.message : "채팅 폴더 이름을 바꾸지 못했습니다.");
    }).finally(() => finishAction(key));
  };

  const removeFolder = (folder: NDXAgentWebChatFolder) => {
    if (folder.kind === "root" || !window.confirm(`'${folder.title}' 폴더와 그 안의 채팅 세션을 삭제할까요?`)) return;
    const key = `chat-folder-delete:${folder.folderid}`;
    if (!startAction(key)) return;
    void deleteChatFolder(folder.folderid).then(async () => {
      const surface = bridge?.getSnapshot().surface;
      if (surface?.kind === "chat-folder" && surface.folderId === folder.folderid || surface?.kind === "chat-draft" && surface.folderId === folder.folderid || surface?.kind === "chat-session" && surface.folderId === folder.folderid) {
        bridge?.clearSurface();
      }
      await refreshChat();
    }).catch((error) => {
      setNotice(error instanceof Error && error.message ? error.message : "채팅 폴더를 삭제하지 못했습니다.");
    }).finally(() => finishAction(key));
  };

  const renameSession = (session: NDXAgentWebChatSession) => {
    const title = window.prompt("채팅 세션 이름", session.title);
    if (!title?.trim() || title.trim() === session.title) return;
    const key = `chat-session-rename:${session.chatsessionid}`;
    if (!startAction(key)) return;
    void updateChatSession(session.chatsessionid, { title }).then(refreshChat).catch((error) => {
      setNotice(error instanceof Error && error.message ? error.message : "채팅 세션 이름을 바꾸지 못했습니다.");
    }).finally(() => finishAction(key));
  };

  const removeSession = (session: NDXAgentWebChatSession) => {
    if (!window.confirm(`'${session.title || session.chatsessionid}' 채팅 세션을 삭제할까요?`)) return;
    const key = `chat-session-delete:${session.chatsessionid}`;
    if (!startAction(key)) return;
    void deleteChatSession(session.chatsessionid).then(async () => {
      const surface = bridge?.getSnapshot().surface;
      if (surface?.kind === "chat-session" && surface.sessionId === session.chatsessionid) {
        bridge?.openChatFolder(session.folderid);
      }
      await refreshChat();
    }).catch((error) => {
      setNotice(error instanceof Error && error.message ? error.message : "채팅 세션을 삭제하지 못했습니다.");
    }).finally(() => finishAction(key));
  };

  return {
    folders,
    sessionsByFolder,
    refreshChat,
    addFolder,
    renameFolder,
    removeFolder,
    renameSession,
    removeSession,
    prepareSessionDraft: (folder: NDXAgentWebChatFolder) => bridge?.openChatDraft(folder.folderid),
    selectFolder: (folder: NDXAgentWebChatFolder) => bridge?.openChatFolder(folder.folderid),
    selectSession: (session: NDXAgentWebChatSession) => bridge?.openChatSession(session.folderid, session.chatsessionid)
  };
}
