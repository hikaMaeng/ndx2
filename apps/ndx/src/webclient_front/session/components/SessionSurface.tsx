import React from "react";
import { AlertTriangle, GripVertical, Menu, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import type { NDXSessionIterationSummary } from "ndx/common/protocol";
import type { NDXAgentWebSession, NDXWebClientProject } from "ndx/webclient/common";
import type { NDXAgentWebContextUsage, SessionAttachmentDraft, SessionUiState, TurnFlowState } from "ndx/webclient/front";
import { RightSidebar } from "../rightsidebar/components/RightSidebar";
import { RSC } from "../../app/resource";
import { CotWorkOverlay } from "../cotWork";
import { AssistantChatMessage } from "./AssistantChatMessage";
import { ChatComposer } from "./ChatComposer";
import { UserChatMessage } from "./UserChatMessage";
import { TurnFlow } from "../turn";

function RightSidebarResizeHandle({ width, onWidthChange }: { width: number; onWidthChange: (width: number) => void }) {
  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => {
      const viewportLimit = Math.max(240, window.innerWidth - 520);
      const rawWidth = startWidth + startX - moveEvent.clientX;
      onWidthChange(Math.min(Math.max(rawWidth, 240), Math.min(560, viewportLimit)));
    };
    const stop = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  return (
    <button type="button" className="hidden h-full w-2 shrink-0 cursor-col-resize items-center justify-center border-l border-zinc-800 bg-zinc-950 text-zinc-600 hover:bg-zinc-900 hover:text-zinc-300 md:flex" aria-label="오른쪽 사이드바 너비 조정" aria-orientation="vertical" role="separator" onPointerDown={startResize}>
      <GripVertical aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}

type SessionSurfaceProps = {
  surfaceKey: string;
  ui: SessionUiState;
  session?: NDXAgentWebSession;
  project?: NDXWebClientProject;
  isActive: boolean;
  notice: string;
  sessionError: string;
  t: Record<string, string>;
  submitPending: boolean;
  interruptPending: boolean;
  onOpenMenu: () => void;
  onToggleRightSidebar: () => void;
  onChatScroll: (scrollTop: number) => void;
  onDisableAutoScroll: () => void;
  onDismissError: () => void;
  onInputChange: (value: string) => void;
  onAddAttachments: (files: File[]) => void;
  onAttachmentRejected: (message: string) => void;
  onRemoveAttachment: (id: string) => void;
  onModelClick: () => void;
  onSkillListRefresh: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onRightSidebarWidthChange: (width: number) => void;
  onRightSidebarScroll: (scrollTop: number) => void;
  onTurnToggle: (turn: TurnFlowState, open: boolean) => void;
  onIterationToggle: (turn: TurnFlowState, iteration: Pick<NDXSessionIterationSummary, "iteration">, open: boolean, userInitiated?: boolean) => void;
};

export function SessionSurface({
  surfaceKey,
  ui,
  session,
  project,
  isActive,
  notice,
  sessionError,
  t,
  submitPending,
  interruptPending,
  onOpenMenu,
  onToggleRightSidebar,
  onChatScroll,
  onDisableAutoScroll,
  onDismissError,
  onInputChange,
  onAddAttachments,
  onAttachmentRejected,
  onRemoveAttachment,
  onModelClick,
  onSkillListRefresh,
  onSubmit,
  onRightSidebarWidthChange,
  onRightSidebarScroll,
  onTurnToggle,
  onIterationToggle,
}: SessionSurfaceProps) {
  const surfaceHasChat = Boolean(session || project);
  const surfaceAgentRunning = Boolean(ui.agentRunning);
  const surfaceCompactRunning = Boolean(ui.compactRunning);
  const surfaceModelLabel = ui.selectedModel.model.trim() || t[RSC.SESSION_MODEL_SELECT_PLACEHOLDER] || "모델 선택";
  const surfaceContextUsage: NDXAgentWebContextUsage | undefined = session ? ui.reportedContextUsage : undefined;
  const suffix = surfaceKey.replace(/[^a-z0-9_-]/giu, "-");
  const attachments = ui.chatAttachments.map(({ id, name, mimeType, size, previewUrl }: SessionAttachmentDraft) => ({ id, name, mimeType, size, previewUrl }));
  const surfaceTitle = session ? (session.title || session.sessionid) : surfaceKey.startsWith("draft:") ? t[RSC.SESSION_PAGE_NEW_DRAFT_TITLE_TEXT] : surfaceKey;
  const chatScrollRef = React.useRef<HTMLElement | null>(null);
  const rightSidebarScrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!isActive || !ui.autoScrollEnabled || !chatScrollRef.current) return;
    chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [isActive, ui.autoScrollEnabled, ui.chatMessages, ui.turnFlows]);

  React.useLayoutEffect(() => {
    if (!isActive) return;
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = ui.chatScrollTop;
    }
    if (rightSidebarScrollRef.current) {
      rightSidebarScrollRef.current.scrollTop = ui.rightSidebarScrollTop;
    }
  }, [isActive, surfaceKey]);

  return (
    <div className={isActive ? "contents" : "hidden"}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <button type="button" className="fixed left-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/95 p-0 text-sm font-medium text-zinc-300 shadow-lg shadow-black/30 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 md:hidden" aria-label={t[RSC.APP_SHELL_MENU_OPEN_BUTTON]} onClick={onOpenMenu}><Menu aria-hidden="true" className="h-4 w-4" /></button>
        <button type="button" className="fixed right-4 top-4 z-20 hidden h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950/95 p-0 text-sm font-medium text-zinc-500 shadow-lg shadow-black/30 transition-colors hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 md:inline-flex" aria-label={ui.rightSidebarOpen ? t[RSC.APP_SHELL_RIGHT_SIDEBAR_CLOSE_BUTTON] : t[RSC.APP_SHELL_RIGHT_SIDEBAR_OPEN_BUTTON]} aria-controls={`session-right-sidebar-${suffix}`} aria-expanded={ui.rightSidebarOpen} onClick={onToggleRightSidebar}>
          {ui.rightSidebarOpen ? <PanelRightClose aria-hidden="true" className="h-4 w-4" /> : <PanelRightOpen aria-hidden="true" className="h-4 w-4" />}
        </button>
        <main ref={chatScrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8" onScroll={(event) => onChatScroll(event.currentTarget.scrollTop)} onWheel={onDisableAutoScroll} onTouchMove={onDisableAutoScroll} onPointerDown={(event) => {
          if (event.currentTarget === event.target) {
            onDisableAutoScroll();
          }
        }}>
          {surfaceHasChat ? <div className="pointer-events-none sticky right-0 top-0 z-10 ml-auto w-fit rounded-sm bg-zinc-950/80 px-1.5 py-0.5 text-[10px] text-zinc-500">{ui.autoScrollEnabled ? "autoscroll" : "manual scroll"}</div> : null}
          {surfaceHasChat ? (
            <section className="mx-auto flex min-h-full w-full max-w-4xl min-w-0 flex-col justify-end gap-5" aria-labelledby={`session-page-title-${suffix}`}>
              <div className="grid min-w-0 gap-1 text-center">
                <h1 id={`session-page-title-${suffix}`} className="mx-auto w-full min-w-0 truncate text-base font-semibold leading-6 text-zinc-50" title={surfaceTitle}>{surfaceTitle}</h1>
                <p className="text-xs text-zinc-500">{project?.name ?? t[RSC.SESSION_PAGE_PROJECT_FALLBACK_LABEL]}</p>
              </div>
              {!session ? <p className="text-center text-sm text-zinc-500">{t[RSC.SESSION_PAGE_NEW_DRAFT_DESCRIPTION_TEXT]}</p> : null}
              <ol className="grid min-w-0 gap-4" aria-label={t[RSC.SESSION_PAGE_MESSAGES_LABEL]}>
                {ui.chatMessages.map((message) => (
                  <React.Fragment key={message.id}>
                    <li className={message.role === "user" ? "ndx-wrap-anywhere max-w-[85%] min-w-0 overflow-hidden justify-self-end rounded-lg bg-zinc-100 px-4 py-3 text-sm leading-6 text-zinc-950" : "ndx-wrap-anywhere max-w-[92%] min-w-0 overflow-hidden justify-self-start rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm leading-6 text-zinc-300"}>
                      {message.role === "assistant" ? <AssistantChatMessage text={message.text} copyEnabled={!message.id.startsWith("pending-") && !message.id.startsWith("stream:") && message.text.trim().length > 0} /> : <UserChatMessage text={message.text} attachments={message.attachments} />}
                    </li>
                    {message.role === "user" ? ui.turnFlows.filter((turn) => turn.inputDataId === message.id).map((turn) => <li key={turn.id} className="w-full"><TurnFlow turns={[turn]} onTurnToggle={onTurnToggle} onIterationToggle={onIterationToggle} /></li>) : null}
                  </React.Fragment>
                ))}
                {ui.turnFlows.filter((turn) => !ui.chatMessages.some((message) => message.id === turn.inputDataId)).map((turn) => <li key={turn.id} className="w-full"><TurnFlow turns={[turn]} onTurnToggle={onTurnToggle} onIterationToggle={onIterationToggle} /></li>)}
              </ol>
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
        {surfaceHasChat ? <ChatComposer idSuffix={suffix} agentRunning={surfaceAgentRunning} compactRunning={surfaceCompactRunning} interruptPending={interruptPending} requestPending={submitPending} contextUsage={surfaceContextUsage} input={ui.chatInput} attachments={attachments} skills={ui.availableSkills} modelLabel={surfaceModelLabel} modelModalities={ui.selectedModel.modalities} notice={notice} t={t} onInputChange={onInputChange} onAddAttachments={onAddAttachments} onAttachmentRejected={onAttachmentRejected} onRemoveAttachment={onRemoveAttachment} onModelClick={onModelClick} onSkillListRefresh={onSkillListRefresh} onSubmit={onSubmit} /> : null}
      </div>
      {ui.rightSidebarOpen ? <><RightSidebarResizeHandle width={ui.rightSidebarWidth} onWidthChange={onRightSidebarWidthChange} /><RightSidebar id={`session-right-sidebar-${suffix}`} label={t[RSC.SIDEBAR_RIGHT_LABEL]} scrollRef={(node) => { rightSidebarScrollRef.current = node; }} onScroll={onRightSidebarScroll} items={ui.rightSidebarItems} width={ui.rightSidebarWidth} /></> : null}
    </div>
  );
}
