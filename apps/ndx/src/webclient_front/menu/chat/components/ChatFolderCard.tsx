import React from "react";
import { Folder, Pencil, Plus, Trash2 } from "lucide-react";
import type { NDXAgentWebChatFolder, NDXAgentWebChatSession } from "ndx/webclient/common";
import { ChatSessionRow } from "./ChatSessionRow";

type ChatFolderCardProps = {
  activeFolderId?: string;
  activeSessionId?: string;
  folder: NDXAgentWebChatFolder;
  pending: boolean;
  pendingSessionIds: Set<string>;
  sessions: NDXAgentWebChatSession[];
  onDeleteFolder: (folder: NDXAgentWebChatFolder) => void;
  onDeleteSession: (session: NDXAgentWebChatSession) => void;
  onPrepareSessionDraft: (folder: NDXAgentWebChatFolder) => void;
  onRenameFolder: (folder: NDXAgentWebChatFolder) => void;
  onRenameSession: (session: NDXAgentWebChatSession) => void;
  onSelectFolder: (folder: NDXAgentWebChatFolder) => void;
  onSelectSession: (session: NDXAgentWebChatSession) => void;
};

export const ChatFolderCard = React.memo(function ChatFolderCard({
  activeFolderId,
  activeSessionId,
  folder,
  pending,
  pendingSessionIds,
  sessions,
  onDeleteFolder,
  onDeleteSession,
  onPrepareSessionDraft,
  onRenameFolder,
  onRenameSession,
  onSelectFolder,
  onSelectSession
}: ChatFolderCardProps) {
  const root = folder.kind === "root";
  return (
    <li className="min-w-0">
      <div className={folder.folderid === activeFolderId ? "w-full min-w-0 overflow-hidden rounded-md border border-emerald-700 bg-emerald-950/30 px-2.5 py-2 text-left" : "w-full min-w-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-2 text-left hover:bg-zinc-900"} aria-busy={pending}>
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelectFolder(folder)}>
            <Folder aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-500" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={folder.title}>{folder.title}</span>
          </button>
          <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label="채팅 폴더 이름 수정" disabled={pending || root} title="채팅 폴더 이름 수정" onClick={() => onRenameFolder(folder)}>
            <Pencil aria-hidden="true" className="h-3 w-3" />
          </button>
          <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label="채팅 세션 추가" disabled={pending} title="채팅 세션 추가" onClick={() => onPrepareSessionDraft(folder)}>
            <Plus aria-hidden="true" className="h-3 w-3" />
          </button>
          <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-400 transition-colors hover:bg-red-950 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label="채팅 폴더 삭제" disabled={pending || root} title="채팅 폴더 삭제" onClick={() => onDeleteFolder(folder)}>
            <Trash2 aria-hidden="true" className="h-3 w-3" />
          </button>
        </div>
        {sessions.length > 0 ? (
          <ul className="mt-2 grid min-w-0 gap-1" aria-label="채팅 세션 목록">
            {sessions.map((session) => (
              <ChatSessionRow key={session.chatsessionid} activeSessionId={activeSessionId} pending={pendingSessionIds.has(session.chatsessionid)} session={session} onDeleteSession={onDeleteSession} onRenameSession={onRenameSession} onSelectSession={onSelectSession} />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
});
