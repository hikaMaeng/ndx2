import React from "react";
import { ChevronDown, ChevronUp, Code2, Folder, Plus, Trash2, UserRound } from "lucide-react";
import type { NDXAgentWebSession, NDXWebClientProject } from "ndx/webclient/common";
import { RSC } from "../resource";
import { ProjectSessionRow } from "./ProjectSessionRow";

type ProjectCardProps = {
  active: boolean;
  activeSessionId?: string;
  expanded: boolean;
  idSuffix: string;
  pending: boolean;
  pendingSessionIds: Set<string>;
  project: NDXWebClientProject;
  renameSessionLabel: string;
  sessions: NDXAgentWebSession[];
  t: Record<string, string>;
  onDeleteProject: (project: NDXWebClientProject) => void;
  onDeleteSession: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onOpenProjectInVSCode: (project: NDXWebClientProject) => void;
  onOpenUserDialog: (projectname: string) => void;
  onPrepareSessionDraft: (project: NDXWebClientProject) => void;
  onRenameSession: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onSelectProject: (project: NDXWebClientProject) => void;
  onSelectSession: (project: NDXWebClientProject, sessionid: string) => void;
  onToggleProjectSessions: (projectname: string) => void;
};

export const ProjectCard = React.memo(function ProjectCard({
  active,
  activeSessionId,
  expanded,
  idSuffix,
  pending,
  pendingSessionIds,
  project,
  renameSessionLabel,
  sessions,
  t,
  onDeleteProject,
  onDeleteSession,
  onOpenProjectInVSCode,
  onOpenUserDialog,
  onPrepareSessionDraft,
  onRenameSession,
  onSelectProject,
  onSelectSession,
  onToggleProjectSessions
}: ProjectCardProps) {
  const visibleSessions = expanded ? sessions : sessions.slice(0, 4);
  const hiddenSessionCount = Math.max(0, sessions.length - 4);
  const sessionListId = `project-sessions-${idSuffix}-${project.projectName}`;

  return (
    <li className="min-w-0" data-testid="project-sidebar-item">
      <div className={active ? "w-full min-w-0 overflow-hidden rounded-md border border-emerald-700 bg-emerald-950/30 px-2.5 py-2 text-left" : "w-full min-w-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-2 text-left hover:bg-zinc-900"} aria-busy={pending}>
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelectProject(project)}>
            <Folder aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-500" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={project.path}>{project.name}</span>
          </button>
          <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECT_OPEN_VSCODE_BUTTON]} disabled={pending} title={t[RSC.PROJECT_SIDEBAR_PROJECT_OPEN_VSCODE_BUTTON]} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenProjectInVSCode(project); }}>
            <Code2 aria-hidden="true" className="h-3 w-3" />
          </button>
          <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECT_NEW_SESSION_BUTTON]} disabled={pending} title={t[RSC.PROJECT_SIDEBAR_PROJECT_NEW_SESSION_BUTTON]} onClick={() => onPrepareSessionDraft(project)}>
            <Plus aria-hidden="true" className="h-3 w-3" />
          </button>
          <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECT_CHANGE_USER_BUTTON]} disabled={pending} title={t[RSC.PROJECT_SIDEBAR_PROJECT_CHANGE_USER_BUTTON]} onClick={() => onOpenUserDialog(project.projectName)}>
            <UserRound aria-hidden="true" className="h-3 w-3" />
          </button>
          <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-400 transition-colors hover:bg-red-950 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECT_DELETE_BUTTON]} disabled={pending} title={t[RSC.PROJECT_SIDEBAR_PROJECT_DELETE_BUTTON]} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDeleteProject(project); }}>
            <Trash2 aria-hidden="true" className="h-3 w-3" />
          </button>
        </div>
        {sessions.length > 0 ? (
          <>
            <ul id={sessionListId} className="mt-2 grid min-w-0 gap-1" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECTS_SELECTED_LIST_LABEL]}>
              {visibleSessions.map((session) => (
                <ProjectSessionRow key={session.sessionid} activeSessionId={activeSessionId} pending={pendingSessionIds.has(session.sessionid)} project={project} renameSessionLabel={renameSessionLabel} session={session} t={t} onDeleteSession={onDeleteSession} onRenameSession={onRenameSession} onSelectSession={onSelectSession} />
              ))}
            </ul>
            {hiddenSessionCount > 0 ? (
              <button type="button" className="mt-1 flex w-full min-w-0 items-center justify-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300" aria-controls={sessionListId} aria-expanded={expanded} onClick={() => onToggleProjectSessions(project.projectName)}>
                {expanded ? <ChevronUp aria-hidden="true" className="h-3 w-3" /> : <ChevronDown aria-hidden="true" className="h-3 w-3" />}
                <span className="truncate">{expanded ? t[RSC.PROJECT_SIDEBAR_SESSIONS_COLLAPSE_BUTTON] : `${t[RSC.PROJECT_SIDEBAR_SESSIONS_SHOW_MORE_BUTTON]} ${hiddenSessionCount}`}</span>
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
});
