import { Plus } from "lucide-react";
import { makeLocalProject, type NDXAgentWebPinnedSession, type NDXAgentWebSession, type NDXWebClientProject, type NDXWebClientStateDocument } from "ndx/webclient/common";
import { RSC } from "../resource";
import { ProjectCard } from "./ProjectCard";
import { ProjectSessionRow } from "./ProjectSessionRow";

export function ProjectSidebar({
  activeSessionId,
  idSuffix,
  clientState,
  pendingProjectIds,
  expandedProjectSessionIds,
  sessionsByProject,
  pendingSessionIds,
  pinnedSessions,
  t,
  onPrepareSessionDraft,
  onDeleteProject,
  onDeleteSession,
  onOpenProjectInVSCode,
  onOpenProjectPicker,
  onRenameSession,
  onSelectProject,
  onSelectSession,
  onToggleSessionPin,
  onToggleProjectSessions
}: {
  activeSessionId?: string;
  idSuffix: string;
  clientState: NDXWebClientStateDocument;
  pendingProjectIds: Set<string>;
  pendingSessionIds: Set<string>;
  pinnedSessions: NDXAgentWebPinnedSession[];
  expandedProjectSessionIds: Set<string>;
  sessionsByProject: Record<string, NDXAgentWebSession[]>;
  t: Record<string, string>;
  onPrepareSessionDraft: (project: NDXWebClientProject) => void;
  onDeleteProject: (project: NDXWebClientProject) => void;
  onDeleteSession: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onOpenProjectInVSCode: (project: NDXWebClientProject) => void;
  onOpenProjectPicker: () => void;
  onRenameSession: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onSelectProject: (project: NDXWebClientProject) => void;
  onSelectSession: (project: NDXWebClientProject, sessionid: string) => void;
  onToggleSessionPin: (project: NDXWebClientProject, session: NDXAgentWebSession) => void;
  onToggleProjectSessions: (projectname: string) => void;
}) {
  const projectListTitleId = `project-list-title-${idSuffix}`;
  const pinnedListTitleId = `pinned-session-list-title-${idSuffix}`;
  const pinnedSessionIds = new Set(pinnedSessions.map((session) => session.sessionid));
  const pinSessionLabel = t[RSC.PROJECT_SIDEBAR_SESSION_PIN_BUTTON] || "세션 고정";
  const renameSessionLabel = t[RSC.PROJECT_SIDEBAR_SESSION_RENAME_BUTTON] || "세션 이름 수정";
  const unpinSessionLabel = t[RSC.PROJECT_SIDEBAR_SESSION_UNPIN_BUTTON] || "세션 고정 해제";
  return (
    <>
      <section aria-labelledby={pinnedListTitleId} className="grid min-w-0 gap-3">
        <h2 id={pinnedListTitleId} className="text-xs font-semibold uppercase text-zinc-500">{t[RSC.PROJECT_SIDEBAR_PINNED_SESSIONS_TITLE_TEXT] || "고정된 세션"}</h2>
        {pinnedSessions.length > 0 ? (
          <ul className="grid min-w-0 gap-1" aria-label={t[RSC.PROJECT_SIDEBAR_PINNED_SESSIONS_LIST_LABEL] || "고정된 세션 목록"}>
            {pinnedSessions.map((session) => {
              const project = clientState.projects.find((item) => item.projectName === session.projectname) ?? makeLocalProject({ projectName: session.projectname, path: session.path });
              return (
                <ProjectSessionRow key={session.sessionid} activeSessionId={activeSessionId} pending={pendingSessionIds.has(session.sessionid)} pinned={true} pinSessionLabel={pinSessionLabel} project={project} renameSessionLabel={renameSessionLabel} session={session} t={t} unpinSessionLabel={unpinSessionLabel} onDeleteSession={onDeleteSession} onRenameSession={onRenameSession} onSelectSession={onSelectSession} onToggleSessionPin={onToggleSessionPin} />
              );
            })}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-zinc-800 px-3 py-3 text-sm text-zinc-500">{t[RSC.PROJECT_SIDEBAR_PINNED_SESSIONS_EMPTY_MESSAGE] || "고정된 세션 없음"}</p>
        )}
      </section>

      <section aria-labelledby={projectListTitleId} className="grid min-w-0 gap-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 id={projectListTitleId} className="text-xs font-semibold uppercase text-zinc-500">{t[RSC.PROJECT_SIDEBAR_PROJECTS_TITLE_TEXT]}</h2>
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECTS_ADD_BUTTON]} aria-haspopup="dialog" onClick={onOpenProjectPicker}>
            <Plus aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        {clientState.projects.length > 0 ? (
          <ul className="grid min-w-0 gap-2" aria-label={t[RSC.PROJECT_SIDEBAR_PROJECTS_SELECTED_LIST_LABEL]}>
            {clientState.projects.map((project) => {
              const sessions = sessionsByProject[project.projectName] ?? [];
              const expanded = expandedProjectSessionIds.has(project.projectName);
              return (
                <ProjectCard key={project.projectName} active={project.projectName === clientState.activeProjectName} activeSessionId={activeSessionId} expanded={expanded} idSuffix={idSuffix} pending={pendingProjectIds.has(project.projectName)} pendingSessionIds={pendingSessionIds} pinnedSessionIds={pinnedSessionIds} pinSessionLabel={pinSessionLabel} project={project} renameSessionLabel={renameSessionLabel} sessions={sessions} t={t} unpinSessionLabel={unpinSessionLabel} onPrepareSessionDraft={onPrepareSessionDraft} onDeleteProject={onDeleteProject} onDeleteSession={onDeleteSession} onOpenProjectInVSCode={onOpenProjectInVSCode} onRenameSession={onRenameSession} onSelectProject={onSelectProject} onSelectSession={onSelectSession} onToggleSessionPin={onToggleSessionPin} onToggleProjectSessions={onToggleProjectSessions} />
              );
            })}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-zinc-800 px-3 py-3 text-sm text-zinc-500">{t[RSC.PROJECT_SIDEBAR_PROJECTS_EMPTY_MESSAGE]}</p>
        )}
      </section>
    </>
  );
}
