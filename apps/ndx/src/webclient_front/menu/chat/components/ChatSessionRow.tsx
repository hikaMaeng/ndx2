import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { NDXAgentWebChatSession } from "ndx/webclient/common";

type ChatSessionRowProps = {
  activeSessionId?: string;
  pending: boolean;
  session: NDXAgentWebChatSession;
  onDeleteSession: (session: NDXAgentWebChatSession) => void;
  onRenameSession: (session: NDXAgentWebChatSession) => void;
  onSelectSession: (session: NDXAgentWebChatSession) => void;
};

export const ChatSessionRow = React.memo(function ChatSessionRow({
  activeSessionId,
  pending,
  session,
  onDeleteSession,
  onRenameSession,
  onSelectSession
}: ChatSessionRowProps) {
  return (
    <li className="min-w-0" aria-busy={pending}>
      <div className={session.chatsessionid === activeSessionId ? "flex w-full min-w-0 items-center gap-1 overflow-hidden rounded border border-emerald-700 bg-emerald-950/50 px-1 py-1 text-xs text-emerald-200" : "flex w-full min-w-0 items-center gap-1 overflow-hidden rounded border border-zinc-800 bg-zinc-950 px-1 py-1 text-xs text-zinc-400 hover:bg-zinc-900"}>
        <button type="button" disabled={pending} className="block min-w-0 flex-1 overflow-hidden px-1 text-left disabled:pointer-events-none disabled:opacity-50" onClick={() => onSelectSession(session)}>
          <span className="block min-w-0 truncate" title={session.title || session.chatsessionid}>{session.title || session.chatsessionid}</span>
        </button>
        <button type="button" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label="채팅 세션 이름 수정" disabled={pending} title="채팅 세션 이름 수정" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRenameSession(session); }}>
          <Pencil aria-hidden="true" className="h-3 w-3" />
        </button>
        <button type="button" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-500 transition-colors hover:bg-red-950 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label="채팅 세션 삭제" disabled={pending} title="채팅 세션 삭제" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDeleteSession(session); }}>
          <Trash2 aria-hidden="true" className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
});
