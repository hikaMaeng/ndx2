import React from "react";
import { AlertTriangle, GripVertical, Menu, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { agentWebDomain, normalizeWebClientState, type NDXAgentWebMetadataResponse, type NDXAgentWebSession, type NDXAgentWebUser, type NDXWebClientProject, type NDXWebClientStateDocument } from "ndx/agent/web";
import { NDX_TURN_EVENT, isNDXCotWorkContents, type NDXCotWorkContents, type NDXSessionAttachedMessage, type NDXSessionCreatedMessage, type NDXSessionEventMessage, type NDXSessionHistorySummaryResultMessage, type NDXSessionIterationDetailResultMessage, type NDXSessionIterationSummary, type NDXSessionSkillSummary, type NDXSessionSkillListResultMessage, type NDXSessionTurnDetailResultMessage, type NDXSessionTurnSummary } from "ndx/agent/common/protocol";
import { listWorkspaceDirectories, putWebClientState } from "./api/appBackendApi";
import { createProjectSession, createUser, createWebProject, createWebProvider, createWebProviderModel, deleteWebProject, deleteWebProvider, deleteWebProviderModel, listProjectSessions, listUsers, listWebProjects, listWebProviderModels, listWebProviders, readProviderModelNames, syncWebProviderModels, updateProjectUser, updateWebProviderModel } from "../project/api/projectBackendApi";
import { SessionTitleDialog } from "../project/modals/SessionTitleDialog";
import { UserDialog } from "../project/modals/UserDialog";
import { Sidebar as MenuSidebar } from "../menu/components/Sidebar";
import { ProjectSidebar } from "../project/components/Sidebar";
import { handleProjectSocketMessage, sendProjectSessionDelete, sendProjectSessionRename, type NDXSessionDeletedMessage, type NDXSessionListChangedMessage, type NDXSessionRenamedMessage } from "../project/socket/projectSocket";
import { RightSidebar } from "../sidebar/components/RightSidebar";
import { ChatComposer } from "../session/components/ChatComposer";
import { CotWorkOverlay } from "../session/components/CotWorkOverlay";
import { MarkdownMessage } from "../session/components/MarkdownMessage";
import { ProtocolStep } from "../session/components/ProtocolStep";
import { StatusLine } from "../session/components/StatusLine";
import { ModelDialog } from "../session/modals/ModelDialog";
import { Button } from "../components/ui/button";
import { openSessionSocket, type SessionSocketClient } from "../session/socket/sessionSocket";
import { applyTurnEvent, TurnFlow, type TurnBatchState, type TurnFlowState } from "../session/turn";
import { loadTranslation, type Translation } from "./translation";
import { cacheClientState, readCachedState, readOrCreateClientId } from "./storage";
import { DEFAULT_MODEL, sessionDataContentsText, sessionDataToChatMessage, toModelConfig, type ChatMessage, type ChatMessageAttachment, type NDXAgentWebContextUsage, type ProviderBundle, type SocketState } from "./types";
import { refreshProjectSessions, useAppInitialization } from "./init/useAppInitialization";
import { RSC } from "./resource";

export function App() {
  const [clientid] = React.useState(readOrCreateClientId);
  const [clientState, setClientState] = React.useState<NDXWebClientStateDocument>(() => readCachedState());
  const [metadata, setMetadata] = React.useState<Partial<NDXAgentWebMetadataResponse>>({ version: "", surface: agentWebDomain.surface });
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = React.useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = React.useState(288);
  const [rightSidebarWidth, setRightSidebarWidth] = React.useState(288);
  const [sessionStatus, setSessionStatus] = React.useState<SocketState>("checking");
  const [socketState, setSocketState] = React.useState<SocketState>("idle");
  const [stateSynced, setStateSynced] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [sessionError, setSessionError] = React.useState("");
  const [projectWarning, setProjectWarning] = React.useState("");
  const [projectWarningTitle, setProjectWarningTitle] = React.useState("");
  const [translation, setTranslation] = React.useState<Translation | null>(null);
  const [lastProtocolEvent, setLastProtocolEvent] = React.useState("");
  const [users, setUsers] = React.useState<NDXAgentWebUser[]>([]);
  const [sessionsByProject, setSessionsByProject] = React.useState<Record<string, NDXAgentWebSession[]>>({});
  const [expandedProjectSessionIds, setExpandedProjectSessionIds] = React.useState<Set<string>>(() => new Set());
  const [activeSessionId, setActiveSessionId] = React.useState<string>();
  const [userModalProjectId, setUserModalProjectId] = React.useState<string>();
  const [renameTarget, setRenameTarget] = React.useState<{ project: NDXWebClientProject; session: NDXAgentWebSession }>();
  const [renameError, setRenameError] = React.useState("");
  const [newUserid, setNewUserid] = React.useState("");
  const [chatInput, setChatInput] = React.useState("");
  const [chatAttachments, setChatAttachments] = React.useState<Array<{ id: string; file: File; name: string; mimeType: string; size: number; previewUrl?: string }>>([]);
  const [availableSkills, setAvailableSkills] = React.useState<NDXSessionSkillSummary[]>([]);
  const [agentRunning, setAgentRunning] = React.useState(false);
  const [modelDialogOpen, setModelDialogOpen] = React.useState(false);
  const [selectedModel, setSelectedModel] = React.useState(DEFAULT_MODEL);
  const [providerBundles, setProviderBundles] = React.useState<ProviderBundle[]>([]);
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [turnFlows, setTurnFlows] = React.useState<TurnFlowState[]>([]);
  const [cotWork, setCotWork] = React.useState<NDXCotWorkContents>();
  const [autoScrollEnabled, setAutoScrollEnabled] = React.useState(true);
  const [sessionTokens, setSessionTokens] = React.useState<Record<string, string>>({});
  const [draftSessionProjectId, setDraftSessionProjectId] = React.useState<string>();
  const [pendingActions, setPendingActions] = React.useState<Set<string>>(() => new Set());
  const [reportedContextUsage, setReportedContextUsage] = React.useState<NDXAgentWebContextUsage | undefined>();
  const socketRef = React.useRef<SessionSocketClient | null>(null);
  const stateRef = React.useRef(clientState);
  const activeSessionIdRef = React.useRef<string | undefined>(activeSessionId);
  const sessionTokensRef = React.useRef<Record<string, string>>({});
  const pendingActionsRef = React.useRef<Set<string>>(new Set());
  const pendingInitialRequestRef = React.useRef<{ text: string; model: ReturnType<typeof toModelConfig>; attachments?: EncodedAttachment[] } | undefined>(undefined);
  const pendingAttachRequestRef = React.useRef<{ sessionid: string; text: string; model: ReturnType<typeof toModelConfig>; attachments?: EncodedAttachment[] } | undefined>(undefined);
  const liveSessionIdsRef = React.useRef<Set<string>>(new Set());
  const restoredModelSessionRef = React.useRef<string | undefined>(undefined);
  const requestedTurnDetailsRef = React.useRef<Set<string>>(new Set());
  const requestedIterationDetailsRef = React.useRef<Set<string>>(new Set());
  const chatAttachmentsRef = React.useRef(chatAttachments);
  const chatScrollRef = React.useRef<HTMLElement | null>(null);
  const autoScrollTimerRef = React.useRef<number | undefined>(undefined);
  const t = translation ?? {};
  const renameSessionText = t[RSC.PROJECT_SESSION_RENAME_DIALOG_TITLE_TEXT] || "세션 이름 수정";
  const renameSessionFailedText = t[RSC.PROJECT_SESSION_RENAME_DIALOG_FAILED_ALERT] || "세션 이름 수정에 실패했습니다.";
  const renameSessionPendingText = t[RSC.PROJECT_SESSION_RENAME_DIALOG_PENDING_STATUS] || "세션 이름 수정 중";
  const renamedSessionText = t[RSC.PROJECT_SESSION_RENAME_DIALOG_SUCCESS_ALERT] || "세션 이름이 수정되었습니다.";
  const activeProject = clientState.projects.find((project) => project.id === clientState.activeProjectId);
  const draftProject = clientState.projects.find((project) => project.id === draftSessionProjectId);
  const activeSession = Object.values(sessionsByProject).flat().find((session) => session.sessionid === activeSessionId);
  const hasChatSurface = Boolean(activeSessionId || activeSession || draftProject);
  const contextUsage = activeSession ? reportedContextUsage : undefined;

  React.useEffect(() => {
    stateRef.current = clientState;
    document.documentElement.lang = clientState.locale;
    cacheClientState(clientState);
  }, [clientState]);

  React.useEffect(() => {
    sessionTokensRef.current = sessionTokens;
  }, [sessionTokens]);

  React.useEffect(() => {
    chatAttachmentsRef.current = chatAttachments;
  }, [chatAttachments]);

  React.useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    setAgentRunning(Boolean(activeSession?.isrunning));
  }, [activeSessionId, activeSession?.isrunning]);

  React.useEffect(() => {
    let cancelled = false;
    void loadTranslation(clientState.locale).then((nextTranslation) => {
      if (!cancelled) {
        setTranslation(nextTranslation);
        setMetadata((current) => ({
          ...current,
          version: current.version || nextTranslation[RSC.APP_METADATA_VERSION_FALLBACK_TEXT],
          surface: current.surface || agentWebDomain.surface
        }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [clientState.locale]);

  useAppInitialization({
    clientid,
    setMetadata,
    setClientState,
    setUsers,
    setSessionsByProject,
    setStateSynced,
    setSessionStatus
  });

  React.useEffect(() => {
    void refreshProjectSessions(clientState.projects, setSessionsByProject);
  }, [clientState.projects]);

  const refreshProviderBundles = () => {
    return (async () => {
      const providers = await listWebProviders();
      const nextBundles: ProviderBundle[] = [];
      for (const provider of providers) {
        nextBundles.push({ provider, models: await listWebProviderModels(provider.title) });
      }
      setProviderBundles(nextBundles);
      return nextBundles;
    })();
  };

  const syncProviderFromBrowser = async (provider: { title: string; url: string; token: string }) => {
    const names = await readProviderModelNames(provider);
    const existing = new Set((await listWebProviderModels(provider.title)).map((model) => model.model));
    for (const model of names) {
      if (!existing.has(model)) {
        await createWebProviderModel(provider.title, { model, contextsize: 100_000, modalities: ["text"] });
      }
    }
    return names.length;
  };

  React.useEffect(() => {
    void refreshProviderBundles()
      .catch(() => setNotice(t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT]));
  }, [t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT]]);

  React.useEffect(() => {
    if (!activeSessionId) {
      if (!draftSessionProjectId) {
        setChatMessages([]);
        setTurnFlows([]);
        setCotWork(undefined);
        setReportedContextUsage(undefined);
      }
      return;
    }
    setDraftSessionProjectId(undefined);
    requestedTurnDetailsRef.current = new Set();
    requestedIterationDetailsRef.current = new Set();
    setChatMessages([]);
    setTurnFlows([]);
    setCotWork(undefined);
    setReportedContextUsage(undefined);
    const token = sessionTokensRef.current[activeSessionId];
    if (token && socketRef.current?.requestHistorySummary(token)) return;
    if (activeSession) attachSession(activeSession);
  }, [activeSessionId, draftSessionProjectId, activeSession?.sessionid]);

  React.useEffect(() => {
    if (!autoScrollEnabled || !chatScrollRef.current) return;
    chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [autoScrollEnabled, chatMessages, turnFlows, hasChatSurface]);

  React.useEffect(() => () => {
    if (autoScrollTimerRef.current) {
      window.clearTimeout(autoScrollTimerRef.current);
    }
    for (const attachment of chatAttachmentsRef.current) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }
  }, []);

  React.useEffect(() => {
    if (!activeSession) return;
    if (restoredModelSessionRef.current === activeSession.sessionid) return;
    const bundle =
      providerBundles.find((item) => activeSession.model.url && item.provider.url === activeSession.model.url && item.provider.token === activeSession.model.token) ??
      providerBundles.find((item) => item.models.some((model) => model.model === activeSession.model.model));
    const modelRow = bundle?.models.find((model) => model.model === activeSession.model.model);
    setSelectedModel({
      provider: bundle?.provider.title ?? "",
      model: activeSession.model.model,
      contextsize: activeSession.model.contextsize || modelRow?.contextsize || 100_000,
      url: bundle?.provider.url || activeSession.model.url || "",
      token: bundle?.provider.token || activeSession.model.token || "",
      modalities: activeSession.model.modalities ?? modelRow?.modalities ?? ["text"],
      ...(typeof activeSession.model.temperature === "number" ? { temperature: activeSession.model.temperature } : typeof modelRow?.temperature === "number" ? { temperature: modelRow.temperature } : {}),
      ...(typeof activeSession.model.topP === "number" ? { topP: activeSession.model.topP } : typeof modelRow?.topP === "number" ? { topP: modelRow.topP } : {}),
      ...(typeof activeSession.model.topK === "number" ? { topK: activeSession.model.topK } : typeof modelRow?.topK === "number" ? { topK: modelRow.topK } : {}),
      ...(typeof activeSession.model.minP === "number" ? { minP: activeSession.model.minP } : typeof modelRow?.minP === "number" ? { minP: modelRow.minP } : {})
    });
    restoredModelSessionRef.current = activeSession.sessionid;
  }, [activeSession?.sessionid]);

  React.useEffect(() => {
    if (!activeSession) return;
    const bundle =
      providerBundles.find((item) => activeSession.model.url && item.provider.url === activeSession.model.url && item.provider.token === activeSession.model.token) ??
      providerBundles.find((item) => item.models.some((model) => model.model === activeSession.model.model));
    if (bundle && (!selectedModel.provider || !selectedModel.url)) {
      const modelRow = bundle.models.find((model) => model.model === activeSession.model.model);
      setSelectedModel((current) => ({
        ...current,
        provider: current.provider || bundle.provider.title,
        contextsize: current.contextsize || modelRow?.contextsize || activeSession.model.contextsize,
        modalities: current.modalities ?? modelRow?.modalities ?? activeSession.model.modalities ?? ["text"],
        url: bundle.provider.url || current.url,
        token: bundle.provider.token || current.token,
        ...(typeof current.temperature === "number" ? { temperature: current.temperature } : typeof modelRow?.temperature === "number" ? { temperature: modelRow.temperature } : typeof activeSession.model.temperature === "number" ? { temperature: activeSession.model.temperature } : {}),
        ...(typeof current.topP === "number" ? { topP: current.topP } : typeof modelRow?.topP === "number" ? { topP: modelRow.topP } : typeof activeSession.model.topP === "number" ? { topP: activeSession.model.topP } : {}),
        ...(typeof current.topK === "number" ? { topK: current.topK } : typeof modelRow?.topK === "number" ? { topK: modelRow.topK } : typeof activeSession.model.topK === "number" ? { topK: activeSession.model.topK } : {}),
        ...(typeof current.minP === "number" ? { minP: current.minP } : typeof modelRow?.minP === "number" ? { minP: modelRow.minP } : typeof activeSession.model.minP === "number" ? { minP: activeSession.model.minP } : {})
      }));
    }
  }, [activeSession?.sessionid, providerBundles, selectedModel.provider, selectedModel.url]);

  React.useEffect(() => () => socketRef.current?.close(), []);

  const startAction = (key: string) => {
    if (pendingActionsRef.current.has(key)) return false;
    const next = new Set(pendingActionsRef.current).add(key);
    pendingActionsRef.current = next;
    setPendingActions(next);
    return true;
  };

  const finishAction = (key: string) => {
    if (!pendingActionsRef.current.has(key)) return;
    const next = new Set(pendingActionsRef.current);
    next.delete(key);
    pendingActionsRef.current = next;
    setPendingActions(next);
  };

  const hasPendingAction = (key: string) => pendingActions.has(key);

  const clearSessionError = () => setSessionError("");

  const rejectActiveSessionRequest = (message: string) => {
    const next = new Set(pendingActionsRef.current);
    next.delete("session-submit");
    next.delete("session-interrupt");
    pendingActionsRef.current = next;
    setPendingActions(next);
    pendingInitialRequestRef.current = undefined;
    pendingAttachRequestRef.current = undefined;
    setAgentRunning(false);
    setSessionError(message);
    setNotice(message);
  };

  const saveState = (nextState: NDXWebClientStateDocument) => {
    const normalized = normalizeWebClientState(nextState);
    stateRef.current = normalized;
    setClientState(normalized);
    cacheClientState(normalized);
    void putWebClientState(clientid, normalized).then(() => setStateSynced(true)).catch(() => setStateSynced(false));
  };

  const reloadProjectMenu = async (preferredActiveProjectId?: string) => {
    const projects = await listWebProjects();
    const activeProjectId =
      preferredActiveProjectId && projects.some((project) => project.id === preferredActiveProjectId)
        ? preferredActiveProjectId
        : stateRef.current.activeProjectId && projects.some((project) => project.id === stateRef.current.activeProjectId)
          ? stateRef.current.activeProjectId
          : projects[0]?.id;
    const nextState: NDXWebClientStateDocument = { ...stateRef.current, projects };
    if (activeProjectId) {
      nextState.activeProjectId = activeProjectId;
    } else {
      delete nextState.activeProjectId;
    }
    if (nextState.lastSession && !projects.some((project) => project.id === nextState.lastSession?.projectId)) {
      delete nextState.lastSession;
    }
    saveState(nextState);
    await refreshProjectSessions(projects, setSessionsByProject);
    return projects;
  };

  const startSidebarResize = (side: "left" | "right", event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftSidebarWidth : rightSidebarWidth;
    const move = (moveEvent: PointerEvent) => {
      const viewportLimit = Math.max(220, window.innerWidth - 520);
      const rawWidth = side === "left" ? startWidth + moveEvent.clientX - startX : startWidth + startX - moveEvent.clientX;
      const nextWidth = Math.min(Math.max(rawWidth, side === "left" ? 220 : 240), Math.min(side === "left" ? 440 : 560, viewportLimit));
      if (side === "left") {
        setLeftSidebarWidth(nextWidth);
      } else {
        setRightSidebarWidth(nextWidth);
      }
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

  const updateContextUsage = (usage?: NDXAgentWebContextUsage) => {
    if (!usage) return;
    setReportedContextUsage((current) => ({
      ...usage,
      parts: usage.parts ?? current?.parts
    }));
  };

  const handleHistorySummary = (message: NDXSessionHistorySummaryResultMessage) => {
    if (message.sessionid !== activeSessionIdRef.current) return;
    setCotWork(undefined);
    setChatMessages(message.visibleEvents.map(chatMessageFromSessionEvent));
    setTurnFlows(message.turns.map(turnFlowFromSummary));
  };

  const handleSkillList = (message: NDXSessionSkillListResultMessage) => {
    setAvailableSkills(message.skills);
  };

  const handleTurnDetail = (message: NDXSessionTurnDetailResultMessage) => {
    if (message.sessionid !== activeSessionIdRef.current || !message.turn) return;
    const turn = message.turn;
    setTurnFlows((turns) => mergeTurnSummary(turns, turn));
  };

  const handleIterationDetail = (message: NDXSessionIterationDetailResultMessage) => {
    if (message.sessionid !== activeSessionIdRef.current) return;
    setTurnFlows((turns) => applyIterationDetail(turns, message));
  };

  const toggleTurnDetail = (turn: TurnFlowState, open: boolean) => {
    setTurnFlows((turns) => turns.map((current) => current.id === turn.id ? { ...current, collapsed: !open } : current));
    if (!open) return;
    const key = `${turn.sessionid}:${turn.inputDataId}`;
    if (requestedTurnDetailsRef.current.has(key)) return;
    const token = sessionTokensRef.current[turn.sessionid];
    if (!token || !socketRef.current?.requestTurnDetail(token, turn.inputDataId)) return;
    requestedTurnDetailsRef.current.add(key);
  };

  const toggleIterationDetail = (turn: TurnFlowState, iteration: Pick<NDXSessionIterationSummary, "iteration">, open: boolean) => {
    setTurnFlows((turns) => turns.map((current) => current.id === turn.id
      ? {
        ...current,
        batches: current.batches.map((batch) => batch.iteration === iteration.iteration ? { ...batch, collapsed: !open } : batch)
      }
      : current));
    if (!open) return;
    const key = `${turn.sessionid}:${turn.inputDataId}:${iteration.iteration}`;
    if (requestedIterationDetailsRef.current.has(key)) return;
    const token = sessionTokensRef.current[turn.sessionid];
    if (!token || !socketRef.current?.requestIterationDetail(token, turn.inputDataId, iteration.iteration)) return;
    requestedIterationDetailsRef.current.add(key);
  };

  const noteScrollInteraction = () => {
    setAutoScrollEnabled(false);
    if (autoScrollTimerRef.current) {
      window.clearTimeout(autoScrollTimerRef.current);
    }
    autoScrollTimerRef.current = window.setTimeout(() => {
      setAutoScrollEnabled(true);
      requestAnimationFrame(() => {
        chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }, 5_000);
  };

  const handleSessionEvent = (message: NDXSessionEventMessage) => {
    clearSessionError();
    liveSessionIdsRef.current.add(message.sessionid);
    const isActiveSessionEvent = message.sessionid === activeSessionIdRef.current;
    if (message.event === NDX_TURN_EVENT.AssistantRecorded) {
      finishAction("session-submit");
    }
    if (message.event === NDX_TURN_EVENT.InterruptCompleted) {
      finishAction("session-interrupt");
      finishAction("session-submit");
      if (isActiveSessionEvent) {
        setCotWork(undefined);
        setAgentRunning(false);
        setNotice(t[RSC.APP_STATUS_INTERRUPT_STORED_STATUS]);
      }
    }
    if (message.event === NDX_TURN_EVENT.Interrupted && !interruptWasAccepted(message.contents)) {
      finishAction("session-interrupt");
      finishAction("session-submit");
      if (isActiveSessionEvent) {
        setCotWork(undefined);
      }
    }
    if (!isActiveSessionEvent) {
      void refreshProjectSessions(stateRef.current.projects, setSessionsByProject);
      return;
    }

    if (message.event === NDX_TURN_EVENT.InterruptCompleted) {
      void refreshProjectSessions(stateRef.current.projects, setSessionsByProject);
      return;
    }

    if (message.event === NDX_TURN_EVENT.Interrupted && interruptWasAccepted(message.contents)) {
      if (message.contextUsage) {
        updateContextUsage(message.contextUsage);
      }
      setAgentRunning(true);
      setNotice(t[RSC.SESSION_COMPOSER_INTERRUPT_PENDING_STATUS]);
      return;
    }

    if (message.event === NDX_TURN_EVENT.CotWork && isNDXCotWorkContents(message.contents)) {
      if (message.contextUsage) {
        updateContextUsage(message.contextUsage);
      }
      setCotWork(message.contents);
      setAgentRunning(true);
      setNotice(t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] || "응답 수신 중...");
      return;
    }

    setTurnFlows((turns) => applyTurnEvent(turns, message));
    if (
      message.event === NDX_TURN_EVENT.AssistantDelta ||
      message.event === NDX_TURN_EVENT.AssistantReasoning
    ) {
      if (message.contextUsage) {
        updateContextUsage(message.contextUsage);
      }
      setAgentRunning(true);
      setNotice(t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] || "응답 수신 중...");
      const text = sessionDataContentsText(message.contents) ?? JSON.stringify(message.contents);
      setChatMessages((messages) => {
        const streamId = `stream:${message.sessionid}`;
        const next = messages.filter((item) => item.id !== "empty" && item.id !== streamId);
        return [...next, { id: streamId, role: "assistant", text, attachments: [] }];
      });
      return;
    }
    if (
      message.event === NDX_TURN_EVENT.ModelRequest ||
      message.event === NDX_TURN_EVENT.ModelResume ||
      message.event === NDX_TURN_EVENT.ToolCallRecorded ||
      message.event === NDX_TURN_EVENT.ToolBatchStarted ||
      message.event === NDX_TURN_EVENT.ToolProgress ||
      message.event === NDX_TURN_EVENT.ToolResultRecorded
    ) {
      if (message.contextUsage) {
        updateContextUsage(message.contextUsage);
      }
      setAgentRunning(true);
      setNotice(t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] || "응답 수신 중...");
      return;
    }
    if (message.contextUsage) {
      updateContextUsage(message.contextUsage);
    }
    setAgentRunning(message.event === NDX_TURN_EVENT.InputRecorded);
    setNotice(message.event === NDX_TURN_EVENT.Interrupted ? t[RSC.APP_STATUS_INTERRUPT_STORED_STATUS] : message.event === NDX_TURN_EVENT.AssistantRecorded ? t[RSC.APP_STATUS_REQUEST_STORED_STATUS] : t[RSC.APP_STATUS_REQUEST_STORED_STATUS]);
    const rowType =
      message.event === NDX_TURN_EVENT.Interrupted
        ? "interrupt"
        : message.event === NDX_TURN_EVENT.AssistantRecorded
          ? "assistant"
          : "user";
    const nextMessage = sessionDataToChatMessage({ dataid: message.dataid, sessionid: message.sessionid, type: rowType, contents: message.contents, createdat: message.createdat });
    setChatMessages((messages) => {
      const next = messages.filter((item) => item.id !== "empty" && item.id !== nextMessage.id && (message.event !== NDX_TURN_EVENT.AssistantRecorded || item.id !== `stream:${message.sessionid}`));
      return [...next, nextMessage];
    });
    void refreshProjectSessions(stateRef.current.projects, setSessionsByProject);
  };

  const handleSessionCreated = (message: NDXSessionCreatedMessage) => {
    clearSessionError();
    liveSessionIdsRef.current.add(message.sessionid);
    activeSessionIdRef.current = message.sessionid;
    setDraftSessionProjectId(undefined);
    setActiveSessionId(message.sessionid);
    setTurnFlows([]);
    setSessionsByProject((current) => ({
      ...current,
      [message.projectid]: [
        {
          sessionid: message.sessionid,
          userid: message.userid,
          title: message.title,
          lastupdated: message.lastupdated,
          mode: message.mode,
          path: message.path,
          projectid: message.projectid,
          model: message.model,
          isrunning: message.isrunning
        },
        ...(current[message.projectid] ?? []).filter((session) => session.sessionid !== message.sessionid)
      ]
    }));
    if (message.connectionToken) {
      const nextTokens = { ...sessionTokensRef.current, [message.sessionid]: message.connectionToken };
      sessionTokensRef.current = nextTokens;
      setSessionTokens(nextTokens);
    }
    void refreshProjectSessions(stateRef.current.projects, setSessionsByProject);
    const pending = pendingInitialRequestRef.current;
    pendingInitialRequestRef.current = undefined;
    if (!pending) return;
    if (message.connectionToken && socketRef.current?.sendInput(message.connectionToken, pending.text, pending.model, pending.attachments)) {
      setCotWork(undefined);
      return;
    }
    finishAction("session-submit");
    setAgentRunning(false);
    setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
  };

  const handleSessionAttached = (message: NDXSessionAttachedMessage) => {
    clearSessionError();
    const nextTokens = { ...sessionTokensRef.current, [message.sessionid]: message.connectionToken };
    sessionTokensRef.current = nextTokens;
    setSessionTokens(nextTokens);
    if (message.sessionid === activeSessionIdRef.current) {
      socketRef.current?.requestHistorySummary(message.connectionToken);
      socketRef.current?.requestSkillList(message.connectionToken);
    }
    const pending = pendingAttachRequestRef.current;
    if (pending?.sessionid !== message.sessionid) return;
    pendingAttachRequestRef.current = undefined;
    if (socketRef.current?.sendInput(message.connectionToken, pending.text, pending.model, pending.attachments)) {
      setCotWork(undefined);
      setTurnFlows([]);
      return;
    }
    finishAction("session-submit");
    setAgentRunning(false);
    setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
  };

  const handleSessionDeleted = (message: NDXSessionDeletedMessage) => {
    finishAction(`session-delete:${message.sessionid}`);
    liveSessionIdsRef.current.delete(message.sessionid);
    const nextTokens = { ...sessionTokensRef.current };
    delete nextTokens[message.sessionid];
    sessionTokensRef.current = nextTokens;
    setSessionTokens(nextTokens);
    setSessionsByProject((current) => ({
      ...current,
      [message.projectid]: (current[message.projectid] ?? []).filter((session) => session.sessionid !== message.sessionid)
    }));
    const project = stateRef.current.projects.find((item) => item.id === message.projectid && item.userid === message.userid);
    if (project) {
      void listProjectSessions(project).then((sessions) => {
        setSessionsByProject((current) => ({ ...current, [project.id]: sessions }));
      }).catch(() => setStateSynced(false));
    }
    setNotice(t[RSC.PROJECT_SIDEBAR_SESSION_DELETED_ALERT]);
  };

  const handleSessionRenamed = (message: NDXSessionRenamedMessage) => {
    finishAction(`session-rename:${message.sessionid}`);
    setRenameTarget(undefined);
    setRenameError("");
    setSessionsByProject((current) => ({
      ...current,
      [message.projectid]: (current[message.projectid] ?? []).map((session) => session.sessionid === message.sessionid ? { ...session, ...message } : session)
    }));
    const project = stateRef.current.projects.find((item) => item.id === message.projectid && item.userid === message.userid);
    if (project) {
      void listProjectSessions(project).then((sessions) => {
        setSessionsByProject((current) => ({ ...current, [project.id]: sessions }));
      }).catch(() => setStateSynced(false));
    }
    setNotice(renamedSessionText);
  };

  const handleSessionListChanged = (message: NDXSessionListChangedMessage) => {
    const project = stateRef.current.projects.find((item) => item.id === message.projectid && item.userid === message.userid);
    if (!project) return;
    void listProjectSessions(project).then((sessions) => {
      setSessionsByProject((current) => ({ ...current, [project.id]: sessions }));
    }).catch(() => setStateSynced(false));
  };

  const handleProtocolError = (message: { error: string }) => {
    const next = new Set(pendingActionsRef.current);
    let renameFailed = false;
    const hadSessionRequest = next.has("session-submit") || next.has("session-interrupt") || Boolean(pendingInitialRequestRef.current || pendingAttachRequestRef.current);
    for (const action of next) {
      if (action === "session-submit" || action === "session-interrupt") {
        next.delete(action);
      }
      if (action.startsWith("session-delete:")) {
        next.delete(action);
      }
      if (action.startsWith("session-rename:")) {
        next.delete(action);
        renameFailed = true;
      }
    }
    pendingActionsRef.current = next;
    setPendingActions(next);
    pendingInitialRequestRef.current = undefined;
    pendingAttachRequestRef.current = undefined;
    setSessionError(message.error);
    setNotice(message.error);
    if (hadSessionRequest) {
      setAgentRunning(false);
    }
    if (renameFailed) {
      setRenameError(renameSessionFailedText);
      setRenameTarget(undefined);
      setNotice(renameSessionFailedText);
      setProjectWarningTitle(renameSessionText);
      setProjectWarning(renameSessionFailedText);
    }
  };

  const connectSocket = () => {
    socketRef.current?.close();
    sessionTokensRef.current = {};
    setSessionTokens({});
    socketRef.current = openSessionSocket({ clientid, metadata, getState: () => stateRef.current, setState: saveState, setSocketState, setLastProtocolEvent, setNotice, t, onSocketOpen: () => undefined, onSessionCreated: handleSessionCreated, onSessionAttached: handleSessionAttached, onSessionEvent: handleSessionEvent, onHistorySummary: handleHistorySummary, onSkillList: handleSkillList, onTurnDetail: handleTurnDetail, onIterationDetail: handleIterationDetail, onUnhandledMessage: (message) => handleProjectSocketMessage(message, { onSessionDeleted: handleSessionDeleted, onSessionListChanged: handleSessionListChanged, onSessionRenamed: handleSessionRenamed }), onProtocolError: handleProtocolError, onTransportError: rejectActiveSessionRequest }) ?? null;
  };

  const attachSession = (session: NDXAgentWebSession) => {
    if (sessionTokensRef.current[session.sessionid]) return true;
    if (socketState !== "connected" || !socketRef.current?.isOpen()) return false;
    return Boolean(socketRef.current?.attachSession({
      userid: session.userid,
      projectId: session.projectid,
      projectPath: session.path,
      sessionid: session.sessionid
    }));
  };

  React.useEffect(() => {
    if (!metadata.session?.socketUrl) {
      return;
    }

    connectSocket();
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [metadata.session?.socketUrl]);

  React.useEffect(() => {
    if (socketState === "connected" && socketRef.current?.isOpen() && activeSession) {
      attachSession(activeSession);
    }
  }, [socketState, activeSession?.sessionid]);

  const prepareSessionDraft = (project: NDXWebClientProject) => {
    activeSessionIdRef.current = undefined;
    setActiveSessionId(undefined);
    setDraftSessionProjectId(project.id);
    setSelectedModel(DEFAULT_MODEL);
    setModelDialogOpen(true);
    restoredModelSessionRef.current = undefined;
    saveState({ ...stateRef.current, activeProjectId: project.id, selectedUserid: project.userid });
    setChatMessages([]);
    setTurnFlows([]);
    setCotWork(undefined);
    setReportedContextUsage(undefined);
    clearSessionError();
    setNotice(t[RSC.SESSION_PAGE_NEW_DRAFT_READY_STATUS]);
  };

  const changeProjectUser = (project: NDXWebClientProject, userid: string) => {
    const actionKey = `project-user:${project.id}`;
    if (!startAction(actionKey)) return;
    void updateProjectUser(project.id, userid).then((row) => {
      const projects = stateRef.current.projects.map((item) => item.id === row.projectid ? { ...item, userid: row.userid } : item);
      saveState({ ...stateRef.current, projects, selectedUserid: row.userid });
      setUserModalProjectId(undefined);
      void refreshProjectSessions(projects, setSessionsByProject);
    }).catch(() => setNotice(t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT])).finally(() => finishAction(actionKey));
  };

  const deleteProject = (project: NDXWebClientProject) => {
    const actionKey = `project-delete:${project.id}`;
    if (!startAction(actionKey)) return;
    void (async () => {
      const row = await deleteWebProject(project.id);
      const deletedProjectId = row.projectid;
      setExpandedProjectSessionIds((current) => {
        const next = new Set(current);
        next.delete(deletedProjectId);
        return next;
      });
      if (stateRef.current.activeProjectId === deletedProjectId || draftSessionProjectId === deletedProjectId || (activeSessionId && (sessionsByProject[deletedProjectId] ?? []).some((session) => session.sessionid === activeSessionId))) {
        activeSessionIdRef.current = undefined;
        setActiveSessionId(undefined);
        setDraftSessionProjectId(undefined);
        setChatMessages([]);
        setTurnFlows([]);
        setCotWork(undefined);
        setReportedContextUsage(undefined);
      }
      setNotice(t[RSC.PROJECT_SIDEBAR_PROJECT_DELETED_ALERT]);
      await reloadProjectMenu();
    })().catch(() => setNotice(t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT])).finally(() => finishAction(actionKey));
  };

  const deleteSessionRow = (project: NDXWebClientProject, session: NDXAgentWebSession) => {
    const actionKey = `session-delete:${session.sessionid}`;
    if (!startAction(actionKey)) return;
    setNotice(t[RSC.PROJECT_SIDEBAR_SESSION_DELETE_PENDING_STATUS]);
    clearSessionError();
    if (activeSessionId === session.sessionid) {
      activeSessionIdRef.current = undefined;
      setActiveSessionId(undefined);
      setDraftSessionProjectId(undefined);
      setAgentRunning(false);
      setChatMessages([]);
      setTurnFlows([]);
      setReportedContextUsage(undefined);
    }
    const nextTokens = { ...sessionTokensRef.current };
    delete nextTokens[session.sessionid];
    sessionTokensRef.current = nextTokens;
    setSessionTokens(nextTokens);
    if (!sendProjectSessionDelete(socketRef.current?.socket, { userid: session.userid, projectId: project.id, projectPath: project.path, sessionid: session.sessionid })) {
      finishAction(actionKey);
      setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
    }
  };

  const renameSessionRow = (project: NDXWebClientProject, session: NDXAgentWebSession) => {
    setRenameError("");
    setRenameTarget({ project, session });
  };

  const submitSessionRename = (title: string) => {
    if (!renameTarget) return;
    const actionKey = `session-rename:${renameTarget.session.sessionid}`;
    if (!startAction(actionKey)) return;
    setRenameError("");
    setNotice(renameSessionPendingText);
    if (!sendProjectSessionRename(socketRef.current?.socket, {
      userid: renameTarget.session.userid,
      projectId: renameTarget.project.id,
      projectPath: renameTarget.project.path,
      sessionid: renameTarget.session.sessionid,
      title
    })) {
      finishAction(actionKey);
      setRenameError(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
      setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
    }
  };

  const toggleProjectSessions = (projectid: string) => {
    setExpandedProjectSessionIds((current) => {
      const next = new Set(current);
      if (next.has(projectid)) {
        next.delete(projectid);
      } else {
        next.add(projectid);
      }
      return next;
    });
  };

  const openProjectInVSCode = (project: NDXWebClientProject) => {
    const localPath = projectPathForVSCode(project.path, metadata.workspace);
    window.location.href = `vscode://file/${encodeURI(localPath.replace(/\\/g, "/"))}`;
  };

  const createAndSelectUser = (project: NDXWebClientProject) => {
    const actionKey = `user-create:${project.id}`;
    if (!startAction(actionKey)) return;
    const userid = newUserid.trim();
    if (!userid) {
      finishAction(actionKey);
      return;
    }
    void createUser({ userid }).then(() => listUsers()).then((data) => {
      setUsers(data.users);
      setNewUserid("");
      changeProjectUser(project, userid);
    }).catch(() => setNotice(t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT])).finally(() => finishAction(actionKey));
  };

  const addChatAttachments = (files: File[]) => {
    if (files.length === 0) return;
    setChatAttachments((current) => [
      ...current,
      ...files.slice(0, Math.max(0, 8 - current.length)).map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name || "clipboard-attachment",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        previewUrl: (file.type || "").toLowerCase().startsWith("image/") ? URL.createObjectURL(file) : undefined
      }))
    ]);
  };

  const removeChatAttachment = (id: string) => {
    setChatAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  };

  const clearChatAttachments = () => {
    setChatAttachments((current) => {
      for (const attachment of current) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
      return [];
    });
  };

  const submitChatRequest = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (agentRunning) {
      const sessionid = activeSessionId;
      if (!sessionid) return;
      const connectionToken = sessionTokensRef.current[sessionid];
      if (!connectionToken) {
        setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
        return;
      }
      if (!startAction("session-interrupt")) return;
      setNotice(t[RSC.SESSION_COMPOSER_INTERRUPT_PENDING_STATUS]);
      if (!socketRef.current?.sendInterrupt(connectionToken)) {
        finishAction("session-interrupt");
        setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
      }
      return;
    }
    if (!startAction("session-submit")) return;
    const text = chatInput.trim();
    const pendingAttachments = chatAttachments;
    if (!text && pendingAttachments.length === 0) {
      finishAction("session-submit");
      return;
    }
    if (!selectedModel.model.trim()) {
      finishAction("session-submit");
      setModelDialogOpen(true);
      setNotice(t[RSC.SESSION_MODEL_SELECT_PLACEHOLDER] || "모델 선택");
      return;
    }
    setChatInput("");
    clearChatAttachments();
    clearSessionError();
    const project = draftProject ?? activeProject;
    if (!project) {
      finishAction("session-submit");
      setAgentRunning(false);
      setNotice(t[RSC.APP_STATUS_NO_ACTIVE_PROJECT_ALERT]);
      return;
    }

    void (async () => {
      const encodedAttachments = await encodeAttachments(pendingAttachments);
      const sendMessage = (sessionid: string, attachSessionRow?: NDXAgentWebSession) => {
        const model = toModelConfig(selectedModel);
        const connectionToken = sessionTokensRef.current[sessionid];
        if (connectionToken && socketRef.current?.sendInput(connectionToken, text, model, encodedAttachments)) {
          setCotWork(undefined);
          setTurnFlows([]);
          return;
        }
        const session = attachSessionRow ?? Object.values(sessionsByProject).flat().find((item) => item.sessionid === sessionid);
        if (socketRef.current?.isOpen() && session) {
          pendingAttachRequestRef.current = { sessionid, text, model, attachments: encodedAttachments };
          setTurnFlows([]);
          if (attachSession(session)) return;
          pendingAttachRequestRef.current = undefined;
        }
        finishAction("session-submit");
        setAgentRunning(false);
        setNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
      };

      if (draftProject) {
        if (socketState === "connected") {
          const model = toModelConfig(selectedModel);
          pendingInitialRequestRef.current = { text, model, attachments: encodedAttachments };
          if (socketRef.current?.createSession({ userid: project.userid, projectId: project.id, projectPath: project.path, model })) return;
          pendingInitialRequestRef.current = undefined;
        }
        void createProjectSession(project, { model: toModelConfig(selectedModel) }).then((session) => {
          setSessionsByProject((current) => ({
            ...current,
            [project.id]: [session, ...(current[project.id] ?? []).filter((item) => item.sessionid !== session.sessionid)]
          }));
          setDraftSessionProjectId(undefined);
          setActiveSessionId(session.sessionid);
          setTurnFlows([]);
          sendMessage(session.sessionid, session);
        }).catch((error) => {
          const message = error instanceof Error && error.message ? error.message : t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT];
          finishAction("session-submit");
          setAgentRunning(false);
          setSessionError(message);
          setNotice(message);
        });
        return;
      }

      if (!activeSessionId) {
        finishAction("session-submit");
        setAgentRunning(false);
        setNotice(t[RSC.APP_STATUS_NO_ACTIVE_PROJECT_ALERT]);
        return;
      }

      sendMessage(activeSessionId);
    })().catch((error) => {
      const message = error instanceof Error && error.message ? error.message : t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT];
      finishAction("session-submit");
      setAgentRunning(false);
      setSessionError(message);
      setNotice(message);
      setChatInput(text);
      setChatAttachments(pendingAttachments);
    });
  };

  const openProjectPicker = () => {
    if (!startAction("project-add")) return;
    void (async () => {
      const picker = (window as unknown as {
        showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite"; startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos" }) => Promise<{ name: string }>;
      }).showDirectoryPicker;
      if (typeof picker !== "function") {
        setProjectWarningTitle(t[RSC.APP_PROJECT_WARNING_TITLE_TEXT]);
        setProjectWarning(t[RSC.APP_PROJECT_PICKER_UNAVAILABLE_ALERT]);
        return;
      }

      const handle = await picker({ id: "ndx-workspace", mode: "readwrite", startIn: "documents" });
      const folderName = handle.name.trim();
      if (!folderName) {
        setProjectWarningTitle(t[RSC.APP_PROJECT_WARNING_TITLE_TEXT]);
        setProjectWarning(t[RSC.APP_PROJECT_PICKER_FOLDER_REQUIRED_ALERT]);
        return;
      }

      const workspace = await listWorkspaceDirectories("");
      const matched = workspace.directories.find((directory) => directory.name === folderName);
      if (!matched) {
        setProjectWarningTitle(t[RSC.APP_PROJECT_WARNING_TITLE_TEXT]);
        setProjectWarning(t[RSC.APP_PROJECT_PICKER_OUTSIDE_WORKSPACE_ALERT]);
        return;
      }

      const project = await createWebProject({
        path: matched.path,
        userid: stateRef.current.selectedUserid ?? "ndev",
      });
      await reloadProjectMenu(project.id);
      setSidebarOpen(false);
      setNotice(t[RSC.PROJECT_SIDEBAR_PROJECTS_ADDED_ALERT]);
    })().catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const message = error instanceof Error && error.message ? error.message : t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT];
        setProjectWarningTitle(t[RSC.APP_PROJECT_WARNING_TITLE_TEXT]);
        setProjectWarning(message);
      }
    }).finally(() => finishAction("project-add"));
  };

  const sessionText = sessionStatus === "ready" ? t[RSC.SESSION_SOCKET_READY_STATUS] : sessionStatus === "offline" ? t[RSC.SESSION_SOCKET_OFFLINE_ALERT] : t[RSC.SESSION_SOCKET_CHECKING_STATUS];
  const socketText = socketState === "connected" ? t[RSC.SESSION_SOCKET_CONNECTED_STATUS] : socketState === "connecting" ? t[RSC.SESSION_SOCKET_CONNECTING_STATUS] : socketState === "negotiating" ? t[RSC.SESSION_SOCKET_NEGOTIATING_STATUS] : socketState === "error" ? t[RSC.SESSION_SOCKET_ERROR_ALERT] : t[RSC.SESSION_SOCKET_IDLE_STATUS];
  const modelLabel = selectedModel.model.trim() || t[RSC.SESSION_MODEL_SELECT_PLACEHOLDER] || "모델 선택";
  const userDialogProject = clientState.projects.find((project) => project.id === userModalProjectId);
  const renameSessionTarget = renameTarget?.session;
  const sidebar = (idSuffix: string) => (
    <MenuSidebar metadata={metadata} t={t} onChangeLanguage={() => saveState({ ...stateRef.current, locale: stateRef.current.locale === "ko" ? "en" : "ko" })} onClose={() => setSidebarOpen(false)}>
      <ProjectSidebar activeSessionId={activeSessionId} idSuffix={idSuffix} clientState={clientState} pendingProjectIds={new Set(clientState.projects.filter((project) => hasPendingAction(`project-delete:${project.id}`) || hasPendingAction(`project-user:${project.id}`)).map((project) => project.id))} pendingSessionIds={new Set(Object.values(sessionsByProject).flat().filter((session) => hasPendingAction(`session-delete:${session.sessionid}`) || hasPendingAction(`session-rename:${session.sessionid}`)).map((session) => session.sessionid))} expandedProjectSessionIds={expandedProjectSessionIds} sessionsByProject={sessionsByProject} t={t} onPrepareSessionDraft={prepareSessionDraft} onDeleteProject={deleteProject} onDeleteSession={deleteSessionRow} onOpenProjectInVSCode={openProjectInVSCode} onOpenProjectPicker={openProjectPicker} onRenameSession={renameSessionRow} onOpenUserDialog={setUserModalProjectId} onSelectProject={(project) => { clearSessionError(); activeSessionIdRef.current = undefined; setActiveSessionId(undefined); setDraftSessionProjectId(undefined); setChatMessages([]); setTurnFlows([]); setReportedContextUsage(undefined); saveState({ ...stateRef.current, activeProjectId: project.id, selectedUserid: project.userid }); }} onSelectSession={(project, sessionid) => { clearSessionError(); restoredModelSessionRef.current = undefined; activeSessionIdRef.current = sessionid; setActiveSessionId(sessionid); setDraftSessionProjectId(undefined); setChatMessages([]); setTurnFlows([]); setReportedContextUsage(undefined); saveState({ ...stateRef.current, activeProjectId: project.id, selectedUserid: project.userid }); }} onToggleProjectSessions={toggleProjectSessions} />
    </MenuSidebar>
  );

  return (
    <div className="h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="flex h-full min-h-0">
        <div className="hidden h-full shrink-0 md:block" style={{ width: leftSidebarWidth }}>{sidebar("desktop")}</div>
        <button
          type="button"
          className="hidden h-full w-2 shrink-0 cursor-col-resize items-center justify-center border-r border-zinc-800 bg-zinc-950 text-zinc-600 hover:bg-zinc-900 hover:text-zinc-300 md:flex"
          aria-label="왼쪽 사이드바 너비 조정"
          aria-orientation="vertical"
          role="separator"
          onPointerDown={(event) => startSidebarResize("left", event)}
        >
          <GripVertical aria-hidden="true" className="h-4 w-4" />
        </button>
        {sidebarOpen ? <div className="fixed inset-0 z-30 md:hidden"><button type="button" aria-label={t[RSC.APP_SHELL_MENU_CLOSE_BUTTON]} className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} /><div className="relative h-full w-72 max-w-[86vw]">{sidebar("mobile")}</div></div> : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Button type="button" variant="outline" size="sm" className="fixed left-4 top-4 z-20 h-9 w-9 border-zinc-800 bg-zinc-900/95 p-0 text-zinc-300 shadow-lg shadow-black/30 hover:bg-zinc-800 md:hidden" aria-label={t[RSC.APP_SHELL_MENU_OPEN_BUTTON]} onClick={() => setSidebarOpen(true)}><Menu aria-hidden="true" className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" className="fixed right-4 top-4 z-20 hidden h-8 w-8 border-zinc-800 bg-zinc-950/95 p-0 text-zinc-500 shadow-lg shadow-black/30 hover:bg-zinc-900 hover:text-zinc-200 md:inline-flex" aria-label={rightSidebarOpen ? t[RSC.APP_SHELL_RIGHT_SIDEBAR_CLOSE_BUTTON] : t[RSC.APP_SHELL_RIGHT_SIDEBAR_OPEN_BUTTON]} aria-controls="session-right-sidebar" aria-expanded={rightSidebarOpen} onClick={() => setRightSidebarOpen((open) => !open)}>
            {rightSidebarOpen ? <PanelRightClose aria-hidden="true" className="h-4 w-4" /> : <PanelRightOpen aria-hidden="true" className="h-4 w-4" />}
          </Button>
          <main ref={chatScrollRef} className={hasChatSurface ? "relative min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8" : "relative min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8"} onWheel={noteScrollInteraction} onTouchMove={noteScrollInteraction} onPointerDown={noteScrollInteraction}>
            {hasChatSurface ? <div className="pointer-events-none sticky right-0 top-0 z-10 ml-auto w-fit rounded-sm bg-zinc-950/80 px-1.5 py-0.5 text-[10px] text-zinc-500">{autoScrollEnabled ? "autoscroll" : "manual scroll"}</div> : null}
            {hasChatSurface ? (
              <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-end gap-5" aria-labelledby="session-page-title">
                <div className="grid gap-2 text-center">
                  <h1 id="session-page-title" className="text-2xl font-semibold leading-8 text-zinc-50">
                    {activeSession ? (activeSession.title || activeSession.sessionid) : activeSessionId ? activeSessionId : t[RSC.SESSION_PAGE_NEW_DRAFT_TITLE_TEXT]}
                  </h1>
                  <p className="text-xs text-zinc-500">{activeSession ? (activeProject?.name ?? t[RSC.SESSION_PAGE_PROJECT_FALLBACK_LABEL]) : (draftProject?.name ?? activeProject?.name ?? t[RSC.SESSION_PAGE_PROJECT_FALLBACK_LABEL])}</p>
                </div>
                {!activeSession ? <p className="text-center text-sm text-zinc-500">{t[RSC.SESSION_PAGE_NEW_DRAFT_DESCRIPTION_TEXT]}</p> : null}
                <ol className="grid gap-4" aria-label={t[RSC.SESSION_PAGE_MESSAGES_LABEL]}>
                  {chatMessages.map((message) => (
                    <React.Fragment key={message.id}>
                      <li className={message.role === "user" ? "max-w-[85%] justify-self-end rounded-lg bg-zinc-100 px-4 py-3 text-sm leading-6 text-zinc-950" : "max-w-[92%] justify-self-start rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm leading-6 text-zinc-300"}>
                        {message.role === "assistant" ? <div className="prose prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-headings:text-zinc-100 prose-strong:text-zinc-100"><MarkdownMessage text={message.text} /></div> : <UserChatMessage text={message.text} attachments={message.attachments} />}
                      </li>
                      {message.role === "user" ? turnFlows.filter((turn) => turn.inputDataId === message.id).map((turn) => (
                        <li key={turn.id} className="w-full">
                          <TurnFlow turns={[turn]} onTurnToggle={toggleTurnDetail} onIterationToggle={toggleIterationDetail} />
                        </li>
                      )) : null}
                    </React.Fragment>
                  ))}
                  {turnFlows.filter((turn) => !chatMessages.some((message) => message.id === turn.inputDataId)).map((turn) => (
                    <li key={turn.id} className="w-full">
                      <TurnFlow turns={[turn]} onTurnToggle={toggleTurnDetail} onIterationToggle={toggleIterationDetail} />
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </main>
          {hasChatSurface && sessionError ? (
            <section
              role="alert"
              aria-labelledby="session-error-title"
              className="shrink-0 border-t border-red-950/70 bg-red-950/35 px-4 py-3"
            >
              <div className="mx-auto flex w-full max-w-4xl items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-red-800 bg-red-950 text-red-200">
                  <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="session-error-title" className="text-sm font-semibold text-red-100">
                    {t[RSC.SESSION_ERROR_TITLE_TEXT] || "세션 요청이 처리되지 않았습니다"}
                  </h2>
                  <p className="mt-1 break-words text-sm leading-5 text-red-100/85">{sessionError}</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 w-8 shrink-0 border-red-900 bg-red-950/60 p-0 text-red-100 hover:bg-red-900" aria-label={t[RSC.SESSION_ERROR_DISMISS_BUTTON] || "세션 오류 닫기"} onClick={clearSessionError}>
                  <X aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            </section>
          ) : null}
          {hasChatSurface && cotWork ? <CotWorkOverlay agentRunning={agentRunning} work={cotWork} /> : null}
          {hasChatSurface ? <ChatComposer agentRunning={agentRunning} interruptPending={hasPendingAction("session-interrupt")} requestPending={hasPendingAction("session-submit")} contextUsage={contextUsage} input={chatInput} attachments={chatAttachments.map(({ id, name, mimeType, size, previewUrl }) => ({ id, name, mimeType, size, previewUrl }))} skills={availableSkills} modelLabel={modelLabel} notice={notice} t={t} onInputChange={setChatInput} onAddAttachments={addChatAttachments} onRemoveAttachment={removeChatAttachment} onModelClick={() => setModelDialogOpen(true)} onSubmit={submitChatRequest} /> : null}
        </div>
        {rightSidebarOpen ? (
          <>
            <button
              type="button"
              className="hidden h-full w-2 shrink-0 cursor-col-resize items-center justify-center border-l border-zinc-800 bg-zinc-950 text-zinc-600 hover:bg-zinc-900 hover:text-zinc-300 md:flex"
              aria-label="오른쪽 사이드바 너비 조정"
              aria-orientation="vertical"
              role="separator"
              onPointerDown={(event) => startSidebarResize("right", event)}
            >
              <GripVertical aria-hidden="true" className="h-4 w-4" />
            </button>
            <RightSidebar label={t[RSC.SIDEBAR_RIGHT_LABEL]} turn={turnFlows.at(-1)} width={rightSidebarWidth} />
          </>
        ) : null}
      </div>
      {renameSessionTarget ? <SessionTitleDialog busy={hasPendingAction(`session-rename:${renameSessionTarget.sessionid}`)} error={renameError} session={renameSessionTarget} t={t} onClose={() => { setRenameTarget(undefined); setRenameError(""); }} onRename={submitSessionRename} /> : null}
      {userDialogProject ? <UserDialog busy={hasPendingAction(`user-create:${userDialogProject.id}`) || hasPendingAction(`project-user:${userDialogProject.id}`)} newUserid={newUserid} project={userDialogProject} t={t} users={users} onClose={() => setUserModalProjectId(undefined)} onCreate={() => createAndSelectUser(userDialogProject)} onNewUseridChange={setNewUserid} onSelect={(userid) => changeProjectUser(userDialogProject, userid)} /> : null}
      {modelDialogOpen ? <ModelDialog selectedModel={selectedModel} providers={providerBundles} t={t} onClose={() => setModelDialogOpen(false)} onSelect={(provider, model) => { const bundle = providerBundles.find((item) => item.provider.title === provider); setSelectedModel({ provider, model: model.model, contextsize: model.contextsize, url: bundle?.provider.url ?? "", token: bundle?.provider.token ?? "", modalities: model.modalities ?? ["text"], ...(typeof model.temperature === "number" ? { temperature: model.temperature } : {}), ...(typeof model.topP === "number" ? { topP: model.topP } : {}), ...(typeof model.topK === "number" ? { topK: model.topK } : {}), ...(typeof model.minP === "number" ? { minP: model.minP } : {}) }); setModelDialogOpen(false); }} onAddProvider={async (input) => { const provider = await createWebProvider({ title: input.title, type: "openai", url: input.url, token: input.token }); await refreshProviderBundles(); const synced = await syncWebProviderModels(provider.title).catch(() => ({ models: [], syncError: t[RSC.SESSION_MODEL_DIALOG_MODEL_SYNC_FAILED_ALERT] })); if (synced.syncError) { await syncProviderFromBrowser(provider).catch((error) => setNotice(`${t[RSC.SESSION_MODEL_DIALOG_MODEL_SYNC_FAILED_ALERT]} ${error instanceof Error ? error.message : synced.syncError}`)); } await refreshProviderBundles(); }} onAddModel={async (provider, input) => { await createWebProviderModel(provider, input); await refreshProviderBundles(); }} onSyncProvider={async (provider) => { const synced = await syncWebProviderModels(provider).catch(() => ({ models: [], syncError: t[RSC.SESSION_MODEL_DIALOG_MODEL_SYNC_FAILED_ALERT] })); if (synced.syncError) { const bundle = providerBundles.find((item) => item.provider.title === provider); if (bundle) await syncProviderFromBrowser(bundle.provider).catch((error) => setNotice(`${t[RSC.SESSION_MODEL_DIALOG_MODEL_SYNC_FAILED_ALERT]} ${error instanceof Error ? error.message : synced.syncError}`)); } await refreshProviderBundles(); }} onUpdateModel={async (provider, model, input) => { await updateWebProviderModel(provider, model, input); await refreshProviderBundles(); }} onDeleteProvider={async (provider) => { await deleteWebProvider(provider); await refreshProviderBundles(); }} onDeleteModel={async (provider, model) => { await deleteWebProviderModel(provider, model); await refreshProviderBundles(); }} /> : null}
      {projectWarning ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4">
          <section role="alertdialog" aria-modal="true" className="grid w-full max-w-md gap-4 rounded-lg border border-amber-900/70 bg-zinc-950 p-5 shadow-2xl" aria-labelledby="project-warning-title" aria-describedby="project-warning-description">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-amber-800 bg-amber-950/50 text-amber-300">
                  <AlertTriangle aria-hidden="true" className="h-5 w-5" />
                </span>
                <h2 id="project-warning-title" className="text-base font-semibold text-zinc-100">{projectWarningTitle || t[RSC.APP_PROJECT_WARNING_TITLE_TEXT]}</h2>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-8 w-8 shrink-0 border-zinc-800 bg-zinc-900 p-0 text-zinc-300 hover:bg-zinc-800" aria-label={t[RSC.APP_PROJECT_WARNING_CLOSE_BUTTON]} onClick={() => { setProjectWarning(""); setProjectWarningTitle(""); }}>
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
            <p id="project-warning-description" className="text-sm leading-6 text-zinc-300">{projectWarning}</p>
            <div className="flex justify-end">
              <Button type="button" className="bg-zinc-100 text-zinc-950 hover:bg-white" onClick={() => { setProjectWarning(""); setProjectWarningTitle(""); }}>{t[RSC.APP_PROJECT_WARNING_CONFIRM_BUTTON]}</Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function UserChatMessage({ text, attachments }: { text: string; attachments: ChatMessageAttachment[] }) {
  return (
    <div className="grid gap-3" data-testid="user-chat-message">
      {text ? <p className="whitespace-pre-wrap break-words">{text}</p> : null}
      {attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="첨부 이미지와 파일">
          {attachments.map((attachment) => (
            <li key={`${attachment.path}:${attachment.index}`} className="min-w-0" data-testid="user-message-attachment">
              {attachment.kind === "image" && attachment.url ? (
                <a href={attachment.url} target="_blank" rel="noreferrer" className="group block h-24 w-24 overflow-hidden rounded-md border border-zinc-300 bg-zinc-200" aria-label={`${attachment.name} 이미지 열기`}>
                  <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                </a>
              ) : (
                <div className="max-w-64 rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-700">
                  <p className="truncate font-medium">{attachment.name}</p>
                  <p className="truncate text-zinc-500">{attachment.mimeType}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function chatMessageFromSessionEvent(message: NDXSessionEventMessage): ChatMessage {
  const rowType = message.event === NDX_TURN_EVENT.AssistantRecorded ? "assistant" : message.event === NDX_TURN_EVENT.Interrupted ? "interrupt" : "user";
  return sessionDataToChatMessage({ dataid: message.dataid, sessionid: message.sessionid, type: rowType, contents: message.contents, createdat: message.createdat });
}

function turnFlowFromSummary(summary: NDXSessionTurnSummary): TurnFlowState {
  return {
    id: `turn:${summary.sessionid}:${summary.inputDataId}`,
    inputDataId: summary.inputDataId,
    sessionid: summary.sessionid,
    title: summary.title,
    status: summary.status,
    collapsed: true,
    createdAt: summary.createdat,
    updatedAt: summary.updatedat,
    sidebarItems: [],
    batches: summary.iterations.map((iteration) => emptyBatch(summary, iteration, true))
  };
}

function mergeTurnSummary(turns: TurnFlowState[], summary: NDXSessionTurnSummary): TurnFlowState[] {
  const existing = turns.find((turn) => turn.inputDataId === summary.inputDataId);
  const nextTurn = existing ? {
    ...existing,
    title: summary.title,
    status: summary.status,
    updatedAt: summary.updatedat,
    batches: summary.iterations.map((iteration) => {
      const current = existing.batches.find((batch) => batch.iteration === iteration.iteration);
      return current ?? emptyBatch(summary, iteration, true);
    })
  } : turnFlowFromSummary(summary);
  return turns.some((turn) => turn.inputDataId === summary.inputDataId)
    ? turns.map((turn) => turn.inputDataId === summary.inputDataId ? nextTurn : turn)
    : [...turns, nextTurn];
}

function applyIterationDetail(turns: TurnFlowState[], detail: NDXSessionIterationDetailResultMessage): TurnFlowState[] {
  return turns.map((turn) => {
    if (turn.inputDataId !== detail.inputDataId) return turn;
    const seed: TurnFlowState = {
      ...turn,
      status: "running",
      collapsed: false,
      batches: turn.batches.length > 0
        ? turn.batches.map((batch) => batch.iteration === detail.iteration ? { ...batch, collapsed: false } : batch)
        : [{
          key: `${turn.id}:iteration:${detail.iteration}`,
          iteration: detail.iteration,
          collapsed: false,
          assistantText: "",
          reasoningText: "",
          modelEvents: [],
          tools: []
        }]
    };
    const reduced = detail.events.reduce(applyTurnEvent, [seed]).at(-1) ?? seed;
    return {
      ...reduced,
      status: turn.status,
      collapsed: false,
      batches: reduced.batches.map((batch) => batch.iteration === detail.iteration ? { ...batch, collapsed: false } : batch)
    };
  });
}

function emptyBatch(summary: NDXSessionTurnSummary, iteration: NDXSessionIterationSummary, collapsed: boolean): TurnBatchState {
  return {
    key: `turn:${summary.sessionid}:${summary.inputDataId}:iteration:${iteration.iteration}`,
    iteration: iteration.iteration,
    collapsed,
    assistantText: "",
    reasoningText: "",
    modelEvents: [],
    tools: []
  };
}

function interruptWasAccepted(contents: NDXSessionEventMessage["contents"]) {
  if (!contents || typeof contents !== "object" || Array.isArray(contents)) return false;
  const interrupt = (contents as { interrupt?: unknown; runtime?: unknown }).interrupt ?? (contents as { runtime?: unknown }).runtime;
  return Boolean(interrupt && typeof interrupt === "object" && (interrupt as { accepted?: unknown }).accepted === true);
}

function projectPathForVSCode(path: string, workspace?: NDXAgentWebMetadataResponse["workspace"]) {
  const normalizedPath = path.replace(/\\/g, "/");
  if (!workspace) return normalizedPath;
  const containerRoot = workspace.containerWorkspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
  if (normalizedPath === containerRoot) {
    return workspace.hostWorkspaceRoot;
  }
  if (normalizedPath.startsWith(`${containerRoot}/`)) {
    return `${workspace.hostWorkspaceRoot.replace(/\\/g, "/").replace(/\/$/, "")}/${normalizedPath.slice(containerRoot.length + 1)}`;
  }
  return normalizedPath;
}

type EncodedAttachment = {
  name: string;
  mimeType: string;
  size: number;
  data: string;
};

async function encodeAttachments(attachments: Array<{ file: File; name: string; mimeType: string; size: number }>): Promise<EncodedAttachment[]> {
  const encoded = [];
  for (const attachment of attachments) {
    const buffer = await attachment.file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
    }
    encoded.push({
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      data: btoa(binary)
    });
  }
  return encoded;
}
