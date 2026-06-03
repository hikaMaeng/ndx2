import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { NDXAgentWebSession, NDXWebClientProject } from "ndx/webclient/common";
import { RSC } from "../resource";

type ProjectSessionRowProps = {
  activeSessionId?: string;
  pending: boolean;
  project: NDXWebClientProject;
  renameSessionLabel: string;
  session: NDXAgentWebSession;
  t: Record<string, string>;
  onDeleteSession: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onRenameSession: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onSelectSession: (project: NDXWebClientProject, sessionid: string) => void;
};

export const ProjectSessionRow = React.memo(function ProjectSessionRow({
  activeSessionId,
  pending,
  project,
  renameSessionLabel,
  session,
  t,
  onDeleteSession,
  onRenameSession,
  onSelectSession
}: ProjectSessionRowProps) {
  return (
    <li className="min-w-0" aria-busy={pending}>
      <div className={session.sessionid === activeSessionId ? "flex w-full min-w-0 items-center gap-1 overflow-hidden rounded border border-emerald-700 bg-emerald-950/50 px-1 py-1 text-xs text-emerald-200" : "flex w-full min-w-0 items-center gap-1 overflow-hidden rounded border border-zinc-800 bg-zinc-950 px-1 py-1 text-xs text-zinc-400 hover:bg-zinc-900"}>
        <button type="button" disabled={pending} className="block min-w-0 flex-1 overflow-hidden px-1 text-left disabled:pointer-events-none disabled:opacity-50" onClick={() => onSelectSession(project, session.sessionid)}>
          <span className="block min-w-0 truncate" title={session.title || session.sessionid}>{session.title || session.sessionid}</span>
        </button>
        <button type="button" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={renameSessionLabel} aria-haspopup="dialog" disabled={pending} title={renameSessionLabel} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRenameSession(project, session); }}>
          <Pencil aria-hidden="true" className="h-3 w-3" />
        </button>
        <button type="button" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-500 transition-colors hover:bg-red-950 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={t[RSC.PROJECT_SIDEBAR_SESSION_DELETE_BUTTON]} disabled={pending} title={t[RSC.PROJECT_SIDEBAR_SESSION_DELETE_BUTTON]} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDeleteSession(project, session); }}>
          <Trash2 aria-hidden="true" className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
});
