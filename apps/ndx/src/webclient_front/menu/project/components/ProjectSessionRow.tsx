import React from "react";
import { Pencil, Pin, Trash2 } from "lucide-react";
import { visibleUserRequestText } from "ndx/webclient/front";
import type { NDXAgentWebSession, NDXWebClientProject } from "ndx/webclient/common";
import { RSC } from "../resource";

type ProjectSessionRowProps = {
  activeSessionId?: string;
  pending: boolean;
  project: NDXWebClientProject;
  pinned: boolean;
  pinSessionLabel: string;
  renameSessionLabel: string;
  session: NDXAgentWebSession;
  t: Record<string, string>;
  unpinSessionLabel: string;
  onDeleteSession: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onRenameSession: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onSelectSession: (project: NDXWebClientProject, sessionid: string) => void;
  onToggleSessionPin: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
};

export const ProjectSessionRow = React.memo(function ProjectSessionRow({
  activeSessionId,
  pending,
  project,
  pinned,
  pinSessionLabel,
  renameSessionLabel,
  session,
  t,
  unpinSessionLabel,
  onDeleteSession,
  onRenameSession,
  onSelectSession,
  onToggleSessionPin
}: ProjectSessionRowProps) {
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const [tooltipRect, setTooltipRect] = React.useState<DOMRect | null>(null);
  const fullTitle = visibleUserRequestText(session.title || "") || session.sessionid;
  const tooltipId = `session-title-tooltip-${session.sessionid}`;
  const showTooltip = () => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (rect) setTooltipRect(rect);
  };
  const hideTooltip = () => setTooltipRect(null);

  return (
    <li className="min-w-0" aria-busy={pending}>
      <div ref={rowRef} className={session.sessionid === activeSessionId ? "flex w-full min-w-0 items-center gap-1 overflow-hidden rounded border border-emerald-700 bg-emerald-950/50 px-1 py-1 text-xs text-emerald-200" : "flex w-full min-w-0 items-center gap-1 overflow-hidden rounded border border-zinc-800 bg-zinc-950 px-1 py-1 text-xs text-zinc-400 hover:bg-zinc-900"}>
        <button type="button" disabled={pending} aria-describedby={tooltipRect ? tooltipId : undefined} className="block min-w-0 flex-1 overflow-hidden px-1 text-left disabled:pointer-events-none disabled:opacity-50" onMouseEnter={showTooltip} onMouseLeave={hideTooltip} onFocus={showTooltip} onBlur={hideTooltip} onClick={() => onSelectSession(project, session.sessionid)}>
          <span className="block min-w-0 truncate">{fullTitle}</span>
        </button>
        {tooltipRect ? (
          <span id={tooltipId} role="tooltip" className="pointer-events-none fixed z-50 max-w-80 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs leading-5 text-zinc-100 shadow-lg" style={{ left: tooltipRect.right + 8, top: tooltipRect.top + tooltipRect.height / 2, transform: "translateY(-50%)" }}>
            {fullTitle}
          </span>
        ) : null}
        <button type="button" className={pinned ? "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-amber-700 bg-amber-950/60 p-0 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-900 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" : "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50"} aria-label={pinned ? unpinSessionLabel : pinSessionLabel} aria-pressed={pinned} disabled={pending} title={pinned ? unpinSessionLabel : pinSessionLabel} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleSessionPin(project, session); }}>
          <Pin aria-hidden="true" className="h-3 w-3" />
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
