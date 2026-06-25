import { createSessionUiState, type SessionUiState, type TurnFlowState } from "ndx/webclient/front";
import type { NDXSessionInputAttachment, NDXSessionIterationSummary, NDXSessionModelConfig } from "ndx/common/protocol";
import type { NDXAgentWebSession, NDXWebClientProject, NDXWebClientStateDocument } from "ndx/webclient/common";
import type { UpdateSessionUi } from "../rightsidebar";
import { SessionSurface } from "./SessionSurface";

type SessionSurfacesProps = {
  activeUiKey?: string;
  clientState: NDXWebClientStateDocument;
  hasPendingAction: (key: string) => boolean;
  notice: string;
  rewriteEnabledBySession: Record<string, boolean>;
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
  onRewriteToggle: (sessionid: string) => void;
  onSkillListRefresh: () => void;
  onQueueAdd: (cotSolveSteps: string) => void;
  onQueuedRequestDelete: (sessionid: string, itemid: string) => void;
  onQueuedRequestUpdate: (sessionid: string, itemid: string, text: string, model: NDXSessionModelConfig, keepAttachmentIds: string[], attachments: NDXSessionInputAttachment[]) => void;
  onSubsessionToggle: (parentKey: string, sessionid: string, expanded: boolean) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onUserMessageBranch: (sessionid: string, inputDataId: string) => void;
  onUserMessageDelete: (sessionid: string, inputDataId: string) => void;
  onTurnToggle: (turn: TurnFlowState, open: boolean) => void;
  sessionError: string;
  sessionsByProject: Record<string, NDXAgentWebSession[]>;
  sessionUiByKey: Record<string, SessionUiState>;
  surfaceKeys: string[];
  t: Record<string, string>;
  updateSessionUi: UpdateSessionUi;
};

export function SessionSurfaces({
  activeUiKey,
  clientState,
  hasPendingAction,
  notice,
  rewriteEnabledBySession,
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
  onRewriteToggle,
  onSkillListRefresh,
  onQueueAdd,
  onQueuedRequestDelete,
  onQueuedRequestUpdate,
  onSubsessionToggle,
  onSubmit,
  onUserMessageBranch,
  onUserMessageDelete,
  onTurnToggle,
  sessionError,
  sessionsByProject,
  sessionUiByKey,
  surfaceKeys,
  t,
  updateSessionUi
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
        ui={ui}
        session={session}
        project={project}
        isActive={key === activeUiKey}
        notice={ui.notice || notice}
        rewriteEnabled={session ? Boolean(rewriteEnabledBySession[session.sessionid]) : false}
        sessionError={ui.sessionError || sessionError}
        sessionUiByKey={sessionUiByKey}
        t={t}
        submitPending={hasPendingAction(`session-submit:${key}`) || hasPendingAction("session-submit")}
        interruptPending={session ? hasPendingAction(`session-interrupt:${session.sessionid}`) || hasPendingAction("session-interrupt") : false}
        onOpenMenu={onOpenMenu}
        onChatScroll={(scrollTop) => onChatScroll(key, scrollTop)}
        onDisableAutoScroll={() => onDisableAutoScroll(key)}
        onDismissError={() => onDismissError(key)}
        onInputChange={(value) => onChatInputChange(key, value)}
        onAddAttachments={onAddAttachments}
        onAttachmentRejected={(message) => onAttachmentRejected(key, message)}
        onRemoveAttachment={onRemoveAttachment}
        onModelClick={() => onModelClick(key)}
        onRewriteToggle={() => { if (session) onRewriteToggle(session.sessionid); }}
        onSkillListRefresh={onSkillListRefresh}
        onQueueAdd={onQueueAdd}
        onQueuedRequestDelete={onQueuedRequestDelete}
        onQueuedRequestUpdate={onQueuedRequestUpdate}
        onSubsessionToggle={onSubsessionToggle}
        onSubmit={onSubmit}
        onUserMessageBranch={onUserMessageBranch}
        onUserMessageDelete={onUserMessageDelete}
        onTurnToggle={onTurnToggle}
        onIterationToggle={onIterationToggle}
        updateSessionUi={updateSessionUi}
      />
    );
  });
}
