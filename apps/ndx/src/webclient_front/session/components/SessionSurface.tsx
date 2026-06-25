import React from "react";
import { AlertTriangle, Bot, ChevronDown, Menu, X } from "lucide-react";
import type { NDXSessionInputAttachment, NDXSessionIterationSummary, NDXSessionModelConfig } from "ndx/common/protocol";
import type { NDXAgentWebSession, NDXWebClientProject } from "ndx/webclient/common";
import { createSessionUiState, isPendingUserChatMessage, sessionTranscriptItems, toModelConfig, type NDXAgentWebContextUsage, type SessionAttachmentDraft, type SessionUiState, type TurnFlowState } from "ndx/webclient/front";
import { RSC } from "../../app/resource";
import { CotWorkOverlay } from "../cotWork";
import { RightSidebarRegion, type UpdateSessionUi } from "../rightsidebar";
import { AssistantChatMessage } from "./AssistantChatMessage";
import { ChatComposer } from "./ChatComposer";
import { TurnNavigation } from "./TurnNavigation";
import { UserChatMessage } from "./UserChatMessage";
import { TurnFlow } from "../turn";
import { RequestQueueBar } from "../requestQueue";

type SessionSurfaceProps = {
  surfaceKey: string;
  ui: SessionUiState;
  session?: NDXAgentWebSession;
  project?: NDXWebClientProject;
  isActive: boolean;
  notice: string;
  rewriteEnabled: boolean;
  sessionError: string;
  sessionUiByKey: Record<string, SessionUiState>;
  t: Record<string, string>;
  submitPending: boolean;
  interruptPending: boolean;
  onOpenMenu: () => void;
  onChatScroll: (scrollTop: number) => void;
  onDisableAutoScroll: () => void;
  onDismissError: () => void;
  onInputChange: (value: string) => void;
  onAddAttachments: (files: File[]) => void;
  onAttachmentRejected: (message: string) => void;
  onRemoveAttachment: (id: string) => void;
  onModelClick: () => void;
  onRewriteToggle: () => void;
  onSkillListRefresh: () => void;
  onQueueAdd: (cotSolveSteps: string) => void;
  onQueuedRequestDelete: (sessionid: string, itemid: string) => void;
  onQueuedRequestUpdate: (sessionid: string, itemid: string, text: string, model: NDXSessionModelConfig, keepAttachmentIds: string[], attachments: NDXSessionInputAttachment[]) => void;
  onSubsessionToggle: (parentKey: string, sessionid: string, expanded: boolean) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onUserMessageBranch: (sessionid: string, inputDataId: string) => void;
  onUserMessageDelete: (sessionid: string, inputDataId: string) => void;
  onTurnToggle: (turn: TurnFlowState, open: boolean) => void;
  onIterationToggle: (turn: TurnFlowState, iteration: Pick<NDXSessionIterationSummary, "iteration">, open: boolean, userInitiated?: boolean) => void;
  updateSessionUi: UpdateSessionUi;
  embedded?: boolean;
  composerVisible?: boolean;
  menuButtonVisible?: boolean;
  rightSidebarVisible?: boolean;
  depth?: number;
  maxDepth?: number;
};

export function SessionSurface({
  surfaceKey,
  ui,
  session,
  project,
  isActive,
  notice,
  rewriteEnabled,
  sessionError,
  sessionUiByKey,
  t,
  submitPending,
  interruptPending,
  onOpenMenu,
  onChatScroll,
  onDisableAutoScroll,
  onDismissError,
  onInputChange,
  onAddAttachments,
  onAttachmentRejected,
  onRemoveAttachment,
  onModelClick,
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
  onIterationToggle,
  updateSessionUi,
  embedded = false,
  composerVisible = true,
  menuButtonVisible = true,
  rightSidebarVisible = true,
  depth = 0,
  maxDepth = 5
}: SessionSurfaceProps) {
  const surfaceHasChat = Boolean(session || project);
  const surfaceAgentRunning = Boolean(ui.agentRunning || session?.isrunning);
  const surfaceCompactRunning = Boolean(ui.compactRunning);
  const surfaceModelLabel = ui.selectedModel.model.trim() || t[RSC.SESSION_MODEL_SELECT_PLACEHOLDER] || "모델 선택";
  const surfaceContextUsage: NDXAgentWebContextUsage | undefined = session ? ui.reportedContextUsage : undefined;
  const historyMutationDisabled = Boolean(surfaceAgentRunning || surfaceCompactRunning || session?.isrunning || submitPending || interruptPending);
  const suffix = surfaceKey.replace(/[^a-z0-9_-]/giu, "-");
  const attachments = ui.chatAttachments.map(({ id, name, mimeType, size, previewUrl }: SessionAttachmentDraft) => ({ id, name, mimeType, size, previewUrl }));
  const surfaceTitle = session ? (session.title || session.sessionid) : surfaceKey.startsWith("draft:") ? t[RSC.SESSION_PAGE_NEW_DRAFT_TITLE_TEXT] : surfaceKey;
  const transcript = sessionTranscriptItems(ui.chatMessages, ui.turnFlows);
  const chatScrollRef = React.useRef<HTMLElement | null>(null);
  const turnRequestRefs = React.useRef(new Map<string, HTMLLIElement>());
  const [visibleTurnInputDataId, setVisibleTurnInputDataId] = React.useState<string | undefined>(ui.turnFlows[0]?.inputDataId);
  const turnInputDataIds = React.useMemo(() => new Set(ui.turnFlows.map((turn) => turn.inputDataId)), [ui.turnFlows]);
  const updateVisibleTurnInputDataId = React.useCallback(() => {
    const root = chatScrollRef.current;
    if (!root || ui.turnFlows.length === 0) {
      setVisibleTurnInputDataId(undefined);
      return;
    }
    const rootBounds = root.getBoundingClientRect();
    const viewportLine = root.scrollTop + 72;
    let nextInputDataId: string | undefined;
    let closestTop = -Infinity;
    for (const turn of ui.turnFlows) {
      const target = turnRequestRefs.current.get(turn.inputDataId);
      if (!target) continue;
      const targetTop = root.scrollTop + target.getBoundingClientRect().top - rootBounds.top;
      if (targetTop <= viewportLine && targetTop >= closestTop) {
        closestTop = targetTop;
        nextInputDataId = turn.inputDataId;
      }
    }
    setVisibleTurnInputDataId((current) => {
      const fallback = turnRequestRefs.current.get(ui.turnFlows[0]?.inputDataId ?? "") ? ui.turnFlows[0]?.inputDataId : current;
      return current === (nextInputDataId ?? fallback) ? current : nextInputDataId ?? fallback;
    });
  }, [ui.turnFlows]);

  React.useEffect(() => {
    for (const inputDataId of Array.from(turnRequestRefs.current.keys())) {
      if (!turnInputDataIds.has(inputDataId)) {
        turnRequestRefs.current.delete(inputDataId);
      }
    }
    if (!visibleTurnInputDataId || turnInputDataIds.has(visibleTurnInputDataId)) return;
    setVisibleTurnInputDataId(ui.turnFlows[0]?.inputDataId);
  }, [turnInputDataIds, ui.turnFlows, visibleTurnInputDataId]);

  React.useEffect(() => {
    if (!isActive || !ui.autoScrollEnabled || !chatScrollRef.current) return;
    chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
    window.requestAnimationFrame(updateVisibleTurnInputDataId);
  }, [isActive, ui.autoScrollEnabled, ui.chatMessages, ui.turnFlows, updateVisibleTurnInputDataId]);

  React.useLayoutEffect(() => {
    if (!isActive) return;
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = ui.chatScrollTop;
    }
    updateVisibleTurnInputDataId();
  }, [isActive, surfaceKey, updateVisibleTurnInputDataId]);

  const rootClassName = !isActive ? "hidden" : embedded ? "flex h-full min-h-[28rem] min-w-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950" : "contents";

  return (
    <div className={rootClassName}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {menuButtonVisible ? <button type="button" className="fixed left-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/95 p-0 text-sm font-medium text-zinc-300 shadow-lg shadow-black/30 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 md:hidden" aria-label={t[RSC.APP_SHELL_MENU_OPEN_BUTTON]} onClick={onOpenMenu}><Menu aria-hidden="true" className="h-4 w-4" /></button> : null}
        <main ref={chatScrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8" onScroll={(event) => {
          onChatScroll(event.currentTarget.scrollTop);
          updateVisibleTurnInputDataId();
        }} onWheel={onDisableAutoScroll} onTouchMove={onDisableAutoScroll} onPointerDown={(event) => {
          if (event.currentTarget === event.target) {
            onDisableAutoScroll();
          }
        }}>
          {surfaceHasChat ? <TurnNavigation turns={ui.turnFlows} activeInputDataId={visibleTurnInputDataId} onSelect={(inputDataId) => {
            onDisableAutoScroll();
            turnRequestRefs.current.get(inputDataId)?.scrollIntoView({ behavior: "smooth", block: "start" });
            setVisibleTurnInputDataId(inputDataId);
          }} /> : null}
          {surfaceHasChat ? <div className="pointer-events-none sticky right-0 top-0 z-10 ml-auto w-fit rounded-sm bg-zinc-950/80 px-1.5 py-0.5 text-[10px] text-zinc-500">{ui.autoScrollEnabled ? "autoscroll" : "manual scroll"}</div> : null}
          {surfaceHasChat ? (
            <section className="mx-auto flex min-h-full w-full max-w-4xl min-w-0 flex-col justify-end gap-5" aria-labelledby={`session-page-title-${suffix}`}>
              <div className="grid min-w-0 gap-1 text-center">
                <h1 id={`session-page-title-${suffix}`} className="mx-auto w-full min-w-0 truncate text-base font-semibold leading-6 text-zinc-50" title={surfaceTitle}>{surfaceTitle}</h1>
                <p className="text-xs text-zinc-500">{project?.name ?? t[RSC.SESSION_PAGE_PROJECT_FALLBACK_LABEL]}</p>
              </div>
              {!session ? <p className="text-center text-sm text-zinc-500">{t[RSC.SESSION_PAGE_NEW_DRAFT_DESCRIPTION_TEXT]}</p> : null}
              <ol className="grid min-w-0 gap-4" aria-label={t[RSC.SESSION_PAGE_MESSAGES_LABEL]}>
                {transcript.map((item) => {
                  if (item.kind === "turn") {
                    return <li key={item.turn.id} className="w-full"><TurnFlow turns={[item.turn]} onTurnToggle={onTurnToggle} onIterationToggle={onIterationToggle} /></li>;
                  }
                  const message = item.message;
                  const userHistoryActionsDisabled = historyMutationDisabled || Boolean(message.historyActionsDisabled);
                  return (
                    <li
                      key={message.id}
                      ref={message.role === "user" && turnInputDataIds.has(message.id) ? (node) => {
                        if (node) {
                          turnRequestRefs.current.set(message.id, node);
                        } else {
                          turnRequestRefs.current.delete(message.id);
                        }
                      } : undefined}
                      data-turn-user-input-id={message.role === "user" && turnInputDataIds.has(message.id) ? message.id : undefined}
                      className={message.role === "user" ? "ndx-wrap-anywhere max-w-[85%] min-w-0 scroll-mt-20 overflow-hidden justify-self-end rounded-lg bg-zinc-100 px-4 py-3 text-sm leading-6 text-zinc-950" : "ndx-wrap-anywhere max-w-[92%] min-w-0 overflow-hidden justify-self-start rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm leading-6 text-zinc-300"}
                    >
                      {message.role === "assistant" ? <AssistantChatMessage text={message.text} copyEnabled={!message.id.startsWith("pending-") && !message.id.startsWith("stream:") && message.text.trim().length > 0} /> : <UserChatMessage text={message.text} attachments={message.attachments} pending={isPendingUserChatMessage(message)} pendingLabel={rewriteEnabled && submitPending ? t[RSC.SESSION_COMPOSER_REWRITE_PENDING_STATUS] || "프롬프트 재작성 중..." : undefined} actionsDisabled={userHistoryActionsDisabled} onBranch={session && !isPendingUserChatMessage(message) && !message.historyActionsDisabled ? () => onUserMessageBranch(session.sessionid, message.id) : undefined} onDelete={session && !isPendingUserChatMessage(message) && !message.historyActionsDisabled ? () => onUserMessageDelete(session.sessionid, message.id) : undefined} />}
                    </li>
                  );
                })}
              </ol>
              {ui.subsessions.length > 0 ? (
                <section className="grid gap-2" aria-label="Subagents">
                  {ui.subsessions.map((subsession) => {
                    const childUi = sessionUiByKey[subsession.sessionid] ?? createSessionUiState();
                    const childSession: NDXAgentWebSession = {
                      sessionid: subsession.sessionid,
                      title: subsession.title || subsession.subagentType,
                      lastupdated: session?.lastupdated ?? new Date(0).toISOString(),
                      mode: session?.mode ?? "none",
                      projectname: session?.projectname ?? project?.projectName ?? "",
                      path: session?.path ?? project?.path ?? "",
                      model: session?.model ?? toModelConfig(ui.selectedModel),
                      isrunning: childUi.agentRunning || subsession.status === "running"
                    };
                    return (
                      <details key={subsession.sessionid} className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/80 text-sm text-zinc-300" open={subsession.expanded} onToggle={(event) => onSubsessionToggle(surfaceKey, subsession.sessionid, event.currentTarget.open)}>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <Bot aria-hidden="true" className="h-4 w-4 shrink-0 text-sky-300" />
                            <span className="truncate font-medium text-zinc-100">{subsession.subagentType}</span>
                            <span className="shrink-0 text-xs text-zinc-500">{subsession.status}</span>
                            {subsession.modeltype ? <span className="hidden shrink-0 text-xs text-zinc-600 sm:inline">{subsession.modeltype}</span> : null}
                          </span>
                          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-500" />
                        </summary>
                        {subsession.expanded ? (
                          <div className="h-[min(70vh,42rem)] min-h-[28rem] border-t border-zinc-800">
                            {depth + 1 >= maxDepth ? (
                              <div className="grid h-full place-items-center px-4 text-xs text-zinc-500">Nested session depth limit reached.</div>
                            ) : (
                              <SessionSurface
                                surfaceKey={subsession.sessionid}
                                ui={childUi}
                                session={childSession}
                                project={project}
                                isActive
                                notice={childUi.notice || notice}
                                rewriteEnabled={false}
                                sessionError={childUi.sessionError}
                                sessionUiByKey={sessionUiByKey}
                                t={t}
                                submitPending={false}
                                interruptPending={interruptPending}
                                onOpenMenu={() => undefined}
                                onChatScroll={(scrollTop) => updateSessionUi(subsession.sessionid, (current) => ({ ...current, chatScrollTop: scrollTop }))}
                                onDisableAutoScroll={() => updateSessionUi(subsession.sessionid, (current) => ({ ...current, autoScrollEnabled: false }))}
                                onDismissError={() => updateSessionUi(subsession.sessionid, (current) => ({ ...current, sessionError: "" }))}
                                onInputChange={(value) => updateSessionUi(subsession.sessionid, (current) => ({ ...current, chatInput: value }))}
                                onAddAttachments={onAddAttachments}
                                onAttachmentRejected={(message) => updateSessionUi(subsession.sessionid, (current) => ({ ...current, notice: message }))}
                                onRemoveAttachment={onRemoveAttachment}
                                onModelClick={() => undefined}
                                onRewriteToggle={() => undefined}
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
                                embedded
                                composerVisible={false}
                                menuButtonVisible={false}
                                rightSidebarVisible={rightSidebarVisible}
                                depth={depth + 1}
                                maxDepth={maxDepth}
                              />
                            )}
                          </div>
                        ) : null}
                      </details>
                    );
                  })}
                </section>
              ) : null}
            </section>
          ) : null}
        </main>
        {surfaceHasChat && sessionError ? (
          <section role="alert" aria-labelledby={`session-error-title-${suffix}`} className="shrink-0 border-t border-red-950/70 bg-red-950/35 px-4 py-3">
            <div className="mx-auto flex w-full max-w-4xl items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-red-800 bg-red-950 text-red-200"><AlertTriangle aria-hidden="true" className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><h2 id={`session-error-title-${suffix}`} className="text-sm font-semibold text-red-100">{t[RSC.SESSION_ERROR_TITLE_TEXT] || "세션 요청이 처리되지 않았습니다"}</h2><p className="mt-1 break-words text-sm leading-5 text-red-100/85">{sessionError}</p></div>
              <button type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-900 bg-red-950/60 p-0 text-sm font-medium text-red-100 transition-colors hover:bg-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" aria-label={t[RSC.SESSION_ERROR_DISMISS_BUTTON] || "세션 오류 닫기"} onClick={onDismissError}><X aria-hidden="true" className="h-4 w-4" /></button>
            </div>
          </section>
        ) : null}
        {surfaceHasChat && ui.cotWork ? <CotWorkOverlay agentRunning={surfaceAgentRunning} work={ui.cotWork} /> : null}
        {surfaceHasChat && session ? (
          <RequestQueueBar
            collapsed={ui.requestQueueCollapsed}
            items={ui.requestQueue}
            onCollapsedChange={(collapsed) => updateSessionUi(session.sessionid, (current) => ({ ...current, requestQueueCollapsed: collapsed }))}
            onDelete={(itemid) => onQueuedRequestDelete(session.sessionid, itemid)}
            onUpdate={(itemid, text, model, keepAttachmentIds, attachments) => onQueuedRequestUpdate(session.sessionid, itemid, text, model, keepAttachmentIds, attachments)}
          />
        ) : null}
        {surfaceHasChat && composerVisible ? <ChatComposer idSuffix={suffix} agentRunning={surfaceAgentRunning} compactRunning={surfaceCompactRunning} interruptPending={interruptPending} requestPending={submitPending} contextUsage={surfaceContextUsage} input={ui.chatInput} attachments={attachments} skills={ui.availableSkills} modelLabel={surfaceModelLabel} modelModalities={ui.selectedModel.modalities} notice={notice} rewriteEnabled={rewriteEnabled} rewriteToggleDisabled={!session} t={t} onInputChange={onInputChange} onAddAttachments={onAddAttachments} onAttachmentRejected={onAttachmentRejected} onRemoveAttachment={onRemoveAttachment} onModelClick={onModelClick} onRewriteToggle={onRewriteToggle} onSkillListRefresh={onSkillListRefresh} onQueueAdd={onQueueAdd} onSubmit={onSubmit} /> : null}
      </div>
      {surfaceHasChat && rightSidebarVisible ? <RightSidebarRegion isActive={isActive} surfaceKey={surfaceKey} t={t} ui={ui} updateSessionUi={updateSessionUi} /> : null}
    </div>
  );
}
