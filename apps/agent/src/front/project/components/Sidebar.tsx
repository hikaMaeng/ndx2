import { ChevronDown, ChevronUp, Code2, Folder, MessageSquare, Network, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { type NDXAgentWebSession, type NDXWebClientProject, type NDXWebClientStateDocument } from "ndx/agent/web";
import { Button } from "../../components/ui/button";
import { RSC } from "../resource";

export function ProjectSidebar({
  activeSessionId,
  idSuffix,
  clientState,
  pendingProjectIds,
  expandedProjectSessionIds,
  sessionsByProject,
  pendingSessionIds,
  t,
  onPrepareSessionDraft,
  onDeleteProject,
  onDeleteSession,
  onOpenProjectInVSCode,
  onOpenProjectPicker,
  onRenameSession,
  onOpenUserDialog,
  onSelectProject,
  onSelectSession,
  onToggleProjectSessions
}: {
  activeSessionId?: string;
  idSuffix: string;
  clientState: NDXWebClientStateDocument;
  pendingProjectIds: Set<string>;
  pendingSessionIds: Set<string>;
  expandedProjectSessionIds: Set<string>;
  sessionsByProject: Record<string, NDXAgentWebSession[]>;
  t: Record<string, string>;
  onPrepareSessionDraft: (project: NDXWebClientProject) => void;
  onDeleteProject: (project: NDXWebClientProject) => void;
  onDeleteSession: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onOpenProjectInVSCode: (project: NDXWebClientProject) => void;
  onOpenProjectPicker: () => void;
  onRenameSession: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onOpenUserDialog: (projectid: string) => void;
  onSelectProject: (project: NDXWebClientProject) => void;
  onSelectSession: (project: NDXWebClientProject, sessionid: string) => void;
  onToggleProjectSessions: (projectid: string) => void;
}) {
  const projectListTitleId = `project-list-title-${idSuffix}`;
  const renameSessionLabel = t[RSC.PROJECT_SIDEBAR_SESSION_RENAME_BUTTON] || "세션 이름 수정";
  return (
    <>
      <section aria-labelledby={projectListTitleId} className="grid min-w-0 gap-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 id={projectListTitleId} className="text-xs font-semibold uppercase text-zinc-500">{t[RSC.PROJECT_SIDEBAR_PROJECTS_TITLE_TEXT]}</h2>
          <Button type="button" variant="outline" size="sm" className="h-8 w-8 border-zinc-800 bg-zinc-900 p-0 text-zinc-300 hover:bg-zinc-800" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECTS_ADD_BUTTON]} aria-haspopup="dialog" onClick={onOpenProjectPicker}>
            <Plus aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>

        {clientState.projects.length > 0 ? (
          <ul className="grid min-w-0 gap-2" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECTS_SELECTED_LIST_LABEL]}>
            {clientState.projects.map((project) => {
              const sessions = sessionsByProject[project.id] ?? [];
              const expanded = expandedProjectSessionIds.has(project.id);
              const visibleSessions = expanded ? sessions : sessions.slice(0, 4);
              const hiddenSessionCount = Math.max(0, sessions.length - 4);
              const sessionListId = `project-sessions-${idSuffix}-${project.id}`;
              return (
              <li key={project.id} className="min-w-0" data-testid="project-sidebar-item">
                <div className={project.id === clientState.activeProjectId ? "w-full min-w-0 overflow-hidden rounded-md border border-emerald-700 bg-emerald-950/30 px-2.5 py-2 text-left" : "w-full min-w-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-2 text-left hover:bg-zinc-900"} aria-busy={pendingProjectIds.has(project.id)}>
                  <div className="flex min-w-0 items-center gap-1">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelectProject(project)}>
                      {project.target === "local" ? <Folder aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-500" /> : <Network aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-500" />}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={project.path}>{project.name}</span>
                    </button>
                    <Button type="button" variant="outline" size="sm" className="h-6 w-6 shrink-0 border-zinc-800 bg-zinc-950 p-0 text-zinc-400 hover:bg-zinc-800" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECT_OPEN_VSCODE_BUTTON]} disabled={pendingProjectIds.has(project.id)} title={t[RSC.PROJECT_SIDEBAR_PROJECT_OPEN_VSCODE_BUTTON]} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenProjectInVSCode(project); }}>
                      <Code2 aria-hidden="true" className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-6 w-6 shrink-0 border-zinc-800 bg-zinc-950 p-0 text-zinc-400 hover:bg-zinc-800" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECT_NEW_SESSION_BUTTON]} disabled={pendingProjectIds.has(project.id)} title={t[RSC.PROJECT_SIDEBAR_PROJECT_NEW_SESSION_BUTTON]} onClick={() => onPrepareSessionDraft(project)}>
                      <Plus aria-hidden="true" className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-6 w-6 shrink-0 border-zinc-800 bg-zinc-950 p-0 text-zinc-400 hover:bg-zinc-800" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECT_CHANGE_USER_BUTTON]} disabled={pendingProjectIds.has(project.id)} title={t[RSC.PROJECT_SIDEBAR_PROJECT_CHANGE_USER_BUTTON]} onClick={() => onOpenUserDialog(project.id)}>
                      <UserRound aria-hidden="true" className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-6 w-6 shrink-0 border-zinc-800 bg-zinc-950 p-0 text-zinc-400 hover:bg-red-950 hover:text-red-200" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECT_DELETE_BUTTON]} disabled={pendingProjectIds.has(project.id)} title={t[RSC.PROJECT_SIDEBAR_PROJECT_DELETE_BUTTON]} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDeleteProject(project); }}>
                      <Trash2 aria-hidden="true" className="h-3 w-3" />
                    </Button>
                  </div>
                  {sessions.length > 0 ? (
                    <>
                    <ul id={sessionListId} className="mt-2 grid min-w-0 gap-1" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECTS_SELECTED_LIST_LABEL]}>
                      {visibleSessions.map((session) => (
                        <li key={session.sessionid} className="min-w-0" aria-busy={pendingSessionIds.has(session.sessionid)}>
                          <div className={session.sessionid === activeSessionId ? "flex w-full min-w-0 items-center gap-1 overflow-hidden rounded border border-emerald-700 bg-emerald-950/50 px-1 py-1 text-xs text-emerald-200" : "flex w-full min-w-0 items-center gap-1 overflow-hidden rounded border border-zinc-800 bg-zinc-950 px-1 py-1 text-xs text-zinc-400 hover:bg-zinc-900"}>
                          <button type="button" disabled={pendingSessionIds.has(session.sessionid)} className="block min-w-0 flex-1 overflow-hidden px-1 text-left disabled:pointer-events-none disabled:opacity-50" onClick={() => onSelectSession(project, session.sessionid)}>
                            <span className="block min-w-0 truncate" title={session.title || session.sessionid}>{session.title || session.sessionid}</span>
                          </button>
                          <Button type="button" variant="outline" size="sm" className="h-5 w-5 shrink-0 border-zinc-800 bg-zinc-950 p-0 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-50" aria-label={renameSessionLabel} aria-haspopup="dialog" disabled={pendingSessionIds.has(session.sessionid)} title={renameSessionLabel} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRenameSession(project, session); }}>
                            <Pencil aria-hidden="true" className="h-3 w-3" />
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="h-5 w-5 shrink-0 border-zinc-800 bg-zinc-950 p-0 text-zinc-500 hover:bg-red-950 hover:text-red-200 disabled:pointer-events-none disabled:opacity-50" aria-label={t[RSC.PROJECT_SIDEBAR_SESSION_DELETE_BUTTON]} disabled={pendingSessionIds.has(session.sessionid)} title={t[RSC.PROJECT_SIDEBAR_SESSION_DELETE_BUTTON]} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDeleteSession(project, session); }}>
                            <Trash2 aria-hidden="true" className="h-3 w-3" />
                          </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {hiddenSessionCount > 0 ? (
                      <button type="button" className="mt-1 flex w-full min-w-0 items-center justify-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300" aria-controls={sessionListId} aria-expanded={expanded} onClick={() => onToggleProjectSessions(project.id)}>
                        {expanded ? <ChevronUp aria-hidden="true" className="h-3 w-3" /> : <ChevronDown aria-hidden="true" className="h-3 w-3" />}
                        <span className="truncate">{expanded ? t[RSC.PROJECT_SIDEBAR_SESSIONS_COLLAPSE_BUTTON] : `${t[RSC.PROJECT_SIDEBAR_SESSIONS_SHOW_MORE_BUTTON]} ${hiddenSessionCount}`}</span>
                      </button>
                    ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            );
            })}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-zinc-800 px-3 py-3 text-sm text-zinc-500">{t[RSC.PROJECT_SIDEBAR_PROJECTS_EMPTY_MESSAGE]}</p>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase text-zinc-500">{t[RSC.PROJECT_SIDEBAR_CHATS_TITLE_TEXT]}</h2>
          <MessageSquare aria-hidden="true" className="h-4 w-4 text-zinc-600" />
        </div>
      </section>
    </>
  );
}
