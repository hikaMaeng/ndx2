import { MessageSquare, Plus } from "lucide-react";
import type { NDXAgentWebChatFolder, NDXAgentWebChatSession } from "ndx/webclient/common";
import { ChatFolderCard } from "./ChatFolderCard";
import { Button } from "../../../components/ui";

type ChatSidebarProps = {
  activeFolderId?: string;
  activeSessionId?: string;
  folders: NDXAgentWebChatFolder[];
  pendingFolderIds: Set<string>;
  pendingSessionIds: Set<string>;
  sessionsByFolder: Record<string, NDXAgentWebChatSession[]>;
  onAddFolder: () => void;
  onDeleteFolder: (folder: NDXAgentWebChatFolder) => void;
  onDeleteSession: (session: NDXAgentWebChatSession) => void;
  onPrepareSessionDraft: (folder: NDXAgentWebChatFolder) => void;
  onRenameFolder: (folder: NDXAgentWebChatFolder) => void;
  onRenameSession: (session: NDXAgentWebChatSession) => void;
  onSelectFolder: (folder: NDXAgentWebChatFolder) => void;
  onSelectSession: (session: NDXAgentWebChatSession) => void;
};

export function ChatSidebar({
  activeFolderId,
  activeSessionId,
  folders,
  pendingFolderIds,
  pendingSessionIds,
  sessionsByFolder,
  onAddFolder,
  onDeleteFolder,
  onDeleteSession,
  onPrepareSessionDraft,
  onRenameFolder,
  onRenameSession,
  onSelectFolder,
  onSelectSession
}: ChatSidebarProps) {
  return (
    <section aria-labelledby="chat-list-title" className="grid min-w-0 gap-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 id="chat-list-title" className="text-xs font-semibold uppercase text-zinc-500">채팅</h2>
        <Button type="button" size={null} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" aria-label="채팅 폴더 추가" title="채팅 폴더 추가" onClick={onAddFolder}>
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
        </Button>
      </div>
      {folders.length > 0 ? (
        <ul className="grid min-w-0 gap-1" aria-label="채팅 폴더 목록">
          {folders.map((folder) => (
            <ChatFolderCard key={folder.folderid} activeFolderId={activeFolderId} activeSessionId={activeSessionId} folder={folder} pending={pendingFolderIds.has(folder.folderid)} pendingSessionIds={pendingSessionIds} sessions={sessionsByFolder[folder.folderid] ?? []} onDeleteFolder={onDeleteFolder} onDeleteSession={onDeleteSession} onPrepareSessionDraft={onPrepareSessionDraft} onRenameFolder={onRenameFolder} onRenameSession={onRenameSession} onSelectFolder={onSelectFolder} onSelectSession={onSelectSession} />
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-zinc-800 px-3 py-3 text-sm text-zinc-500">
          <MessageSquare aria-hidden="true" className="mr-2 inline h-4 w-4 align-[-2px]" />
          채팅 폴더를 불러오는 중입니다.
        </p>
      )}
    </section>
  );
}
