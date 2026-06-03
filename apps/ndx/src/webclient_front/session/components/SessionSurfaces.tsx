import { createSessionUiState, type SessionUiState, type TurnFlowState } from "ndx/webclient/front";
import type { NDXSessionIterationSummary, NDXSessionSkillSummary } from "ndx/common/protocol";
import type { NDXAgentWebSession, NDXWebClientProject, NDXWebClientStateDocument } from "ndx/webclient/common";
import { SessionSurface } from "./SessionSurface";

type SessionSurfacesProps = {
  activeUiKey?: string;
  clientState: NDXWebClientStateDocument;
  hasPendingAction: (key: string) => boolean;
  notice: string;
  onAddAttachments: (files: File[]) => void;
  onAttachmentRejected: (key: string, message: string) => void;
  onChatInputChange: (key: string, value: string) => void;
  onChatScroll: (key: string, scrollTop: number) => void;
  onDisableAutoScroll: (key: string) => void;
  onDismissError: (key: string) => void;
  onIterationToggle: (turn: TurnFlowState, iteration: Pick<NDXSessionIterationSummary, "iteration">, open: boolean, userInitiated?: boolean) => void;
  onModelClick: (key: string) => void;
  onOpenMenu: () => void;
  onRemoveAttachment: (id: string) => void;
  onRightSidebarScroll: (key: string, scrollTop: number) => void;
  onRightSidebarWidthChange: (key: string, width: number) => void;
  onSkillListRefresh: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleRightSidebar: (key: string) => void;
  onTurnToggle: (turn: TurnFlowState, open: boolean) => void;
  sessionError: string;
  sessionsByProject: Record<string, NDXAgentWebSession[]>;
  sessionUiByKey: Record<string, SessionUiState>;
  skillsByProject: Record<string, NDXSessionSkillSummary[]>;
  surfaceKeys: string[];
  t: Record<string, string>;
};

export function SessionSurfaces({
  activeUiKey,
  clientState,
  hasPendingAction,
  notice,
  onAddAttachments,
  onAttachmentRejected,
  onChatInputChange,
  onChatScroll,
  onDisableAutoScroll,
  onDismissError,
  onIterationToggle,
  onModelClick,
  onOpenMenu,
  onRemoveAttachment,
  onRightSidebarScroll,
  onRightSidebarWidthChange,
  onSkillListRefresh,
  onSubmit,
  onToggleRightSidebar,
  onTurnToggle,
  sessionError,
  sessionsByProject,
  sessionUiByKey,
  skillsByProject,
  surfaceKeys,
  t
}: SessionSurfacesProps) {
  return surfaceKeys.map((key) => {
    const ui = sessionUiByKey[key] ?? createSessionUiState();
    const session = Object.values(sessionsByProject).flat().find((item) => item.sessionid === key);
    const project: NDXWebClientProject | undefined = session
      ? clientState.projects.find((item) => item.projectName === session.projectname)
      : key.startsWith("draft:")
        ? clientState.projects.find((item) => item.projectName === key.slice("draft:".length))
        : undefined;
    return (
      <SessionSurface
        key={key}
        surfaceKey={key}
        ui={project && ui.availableSkills.length === 0 && skillsByProject[project.projectName] ? { ...ui, availableSkills: skillsByProject[project.projectName] } : ui}
        session={session}
        project={project}
        isActive={key === activeUiKey}
        notice={ui.notice || notice}
        sessionError={ui.sessionError || sessionError}
        t={t}
        submitPending={hasPendingAction(`session-submit:${key}`) || hasPendingAction("session-submit")}
        interruptPending={session ? hasPendingAction(`session-interrupt:${session.sessionid}`) || hasPendingAction("session-interrupt") : false}
        onOpenMenu={onOpenMenu}
        onToggleRightSidebar={() => onToggleRightSidebar(key)}
        onChatScroll={(scrollTop) => onChatScroll(key, scrollTop)}
        onDisableAutoScroll={() => onDisableAutoScroll(key)}
        onDismissError={() => onDismissError(key)}
        onInputChange={(value) => onChatInputChange(key, value)}
        onAddAttachments={onAddAttachments}
        onAttachmentRejected={(message) => onAttachmentRejected(key, message)}
        onRemoveAttachment={onRemoveAttachment}
        onModelClick={() => onModelClick(key)}
        onSkillListRefresh={onSkillListRefresh}
        onSubmit={onSubmit}
        onRightSidebarWidthChange={(width) => onRightSidebarWidthChange(key, width)}
        onRightSidebarScroll={(scrollTop) => onRightSidebarScroll(key, scrollTop)}
        onTurnToggle={onTurnToggle}
        onIterationToggle={onIterationToggle}
      />
    );
  });
}
