import React from "react";
import type { NDXAgentWebSession, NDXWebClientProject } from "ndx/webclient/common";
import { createProjectSession, encodeAttachments, modelSupportsAttachmentMimeType, pendingUserChatMessage, toModelConfig, withoutPendingUserChatMessages, type SelectedModelConfig, type SessionAttachmentDraft, type SessionUiState } from "ndx/webclient/front";
import type { SessionSocketClient } from "../socket/sessionSocket";
import { RSC } from "../../app/resource";
import { rightSidebarCleared } from "../rightsidebar/state";

type UseSessionRequestControllerOptions = {
  activeProject?: NDXWebClientProject;
  activeSession?: NDXAgentWebSession;
  activeSessionId?: string;
  activeUiKey?: string;
  activeUiKeyRef: React.MutableRefObject<string | undefined>;
  agentRunning: boolean;
  attachSession: (session: NDXAgentWebSession) => boolean;
  chatAttachments: SessionAttachmentDraft[];
  chatInput: string;
  clearChatAttachments: () => void;
  clearSessionError: () => void;
  draftProject?: NDXWebClientProject;
  draftSessionProjectIdRef: React.MutableRefObject<string | undefined>;
  finishAction: (key: string) => void;
  getSocket: () => SessionSocketClient | null;
  modelDialog: { setOpen: (open: boolean) => void };
  refreshSkillList: () => boolean;
  rewriteEnabled: boolean;
  selectedModel: SelectedModelConfig;
  attachedSessionIdsRef: React.MutableRefObject<Set<string>>;
  sessionUiManagerRef: React.MutableRefObject<{ promoteToSession: (sessionid: string, previousKey: string) => void; snapshot: Record<string, SessionUiState> }>;
  sessionsByProject: Record<string, NDXAgentWebSession[]>;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setAgentRunning: (running: boolean) => void;
  setAutoScrollEnabled: (enabled: boolean) => void;
  setChatAttachments: (update: SessionAttachmentDraft[] | ((current: SessionAttachmentDraft[]) => SessionAttachmentDraft[])) => void;
  setChatInput: (value: string) => void;
  setDraftSessionProjectId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setSessionNotice: (message: string) => void;
  setSessionUiByKey: React.Dispatch<React.SetStateAction<Record<string, SessionUiState>>>;
  setSessionsByProject: React.Dispatch<React.SetStateAction<Record<string, NDXAgentWebSession[]>>>;
  socketState: string;
  startAction: (key: string) => boolean;
  t: Record<string, string>;
  updateActiveUi: (update: (current: SessionUiState) => SessionUiState) => void;
  updateSessionUi: (key: string, update: (current: SessionUiState) => SessionUiState) => void;
};

export function useSessionRequestController({
  activeProject,
  activeSession,
  activeSessionId,
  activeUiKey,
  activeUiKeyRef,
  agentRunning,
  attachSession,
  chatAttachments,
  chatInput,
  clearChatAttachments,
  clearSessionError,
  draftProject,
  draftSessionProjectIdRef,
  finishAction,
  getSocket,
  modelDialog,
  refreshSkillList,
  rewriteEnabled,
  selectedModel,
  attachedSessionIdsRef,
  sessionUiManagerRef,
  sessionsByProject,
  setActiveSessionId,
  setAgentRunning,
  setAutoScrollEnabled,
  setChatAttachments,
  setChatInput,
  setDraftSessionProjectId,
  setSessionNotice,
  setSessionUiByKey,
  setSessionsByProject,
  socketState,
  startAction,
  t,
  updateActiveUi,
  updateSessionUi
}: UseSessionRequestControllerOptions) {
  const sessionSubmitActionKey = activeUiKey ? `session-submit:${activeUiKey}` : "session-submit";
  const sessionInterruptActionKey = activeSessionId ? `session-interrupt:${activeSessionId}` : "session-interrupt";

  const submitChatRequest = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const socket = getSocket();
    if (agentRunning && activeSession?.isrunning === false && activeSessionId) {
      updateSessionUi(activeSessionId, (current) => ({ ...current, agentRunning: false, compactRunning: false, cotWork: undefined }));
    }
    if (activeSession?.isrunning === true || (agentRunning && activeSession?.isrunning !== false)) {
      const sessionid = activeSessionId;
      if (!sessionid) return;
      if (!attachedSessionIdsRef.current.has(sessionid)) {
        setSessionNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
        return;
      }
      if (!startAction(sessionInterruptActionKey)) return;
      setSessionNotice(t[RSC.SESSION_COMPOSER_INTERRUPT_PENDING_STATUS]);
      if (!socket?.sendInterrupt(sessionid)) {
        finishAction(sessionInterruptActionKey);
        setSessionNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
      }
      return;
    }
    if (!startAction(sessionSubmitActionKey)) return;
    const text = chatInput.trim();
    const requestText = withRewriterMarker(withThinkingMarker(text, selectedModel.reasoningEffort), rewriteEnabled);
    const pendingAttachments = chatAttachments;
    if (!text && pendingAttachments.length === 0) {
      finishAction(sessionSubmitActionKey);
      return;
    }
    if (!selectedModel.model.trim()) {
      finishAction(sessionSubmitActionKey);
      modelDialog.setOpen(true);
      setSessionNotice(t[RSC.SESSION_MODEL_SELECT_PLACEHOLDER] || "모델 선택");
      return;
    }
    if (pendingAttachments.some((attachment) => !modelSupportsAttachmentMimeType(selectedModel.modalities, attachment.mimeType))) {
      finishAction(sessionSubmitActionKey);
      const supportsImageAttachments = selectedModel.modalities.includes("image");
      const supportsFileAttachments = selectedModel.modalities.includes("file");
      setSessionNotice(
        supportsImageAttachments && !supportsFileAttachments
          ? t[RSC.SESSION_COMPOSER_ATTACHMENT_IMAGE_ONLY_STATUS] || "현재 모델은 이미지 첨부만 지원합니다."
          : supportsFileAttachments && !supportsImageAttachments
            ? t[RSC.SESSION_COMPOSER_ATTACHMENT_FILE_ONLY_STATUS] || "현재 모델은 일반 파일 첨부만 지원합니다."
            : t[RSC.SESSION_COMPOSER_ATTACHMENT_UNSUPPORTED_STATUS] || "현재 모델은 첨부 입력을 지원하지 않습니다."
      );
      return;
    }
    setChatInput("");
    clearChatAttachments();
    clearSessionError();
    const project = draftProject ?? activeProject;
    if (!project) {
      finishAction(sessionSubmitActionKey);
      setAgentRunning(false);
      setSessionNotice(t[RSC.APP_STATUS_NO_ACTIVE_PROJECT_ALERT]);
      return;
    }
    if (!draftProject && !activeSessionId) {
      finishAction(sessionSubmitActionKey);
      setAgentRunning(false);
      setSessionNotice(t[RSC.APP_STATUS_NO_ACTIVE_PROJECT_ALERT]);
      return;
    }
    setAutoScrollEnabled(true);
    const pendingNotice = rewriteEnabled
      ? t[RSC.SESSION_COMPOSER_REWRITE_PENDING_STATUS] || "프롬프트 재작성 중..."
      : t[RSC.APP_STATUS_OPERATION_IN_PROGRESS_STATUS] || "응답 수신 중...";
    updateActiveUi((current) => ({
      ...current,
      agentRunning: true,
      notice: pendingNotice,
      chatMessages: [...withoutPendingUserChatMessages(current.chatMessages), pendingUserChatMessage(text || "첨부 요청")]
    }));
    let activeSubmitActionKey = sessionSubmitActionKey;
    const finishSubmitAction = () => finishAction(activeSubmitActionKey);

    void (async () => {
      refreshSkillList();
      const encodedAttachments = await encodeAttachments(pendingAttachments);
      const sendMessage = (sessionid: string, attachSessionRow?: NDXAgentWebSession) => {
        const model = toModelConfig(selectedModel);
        if (attachedSessionIdsRef.current.has(sessionid) && getSocket()?.sendInput(sessionid, requestText, model, encodedAttachments)) {
          setSessionsByProject((current) => {
            let changed = false;
            const next = Object.fromEntries(Object.entries(current).map(([projectName, sessions]) => [
              projectName,
              sessions.map((session) => {
                if (session.sessionid !== sessionid || session.isrunning) return session;
                changed = true;
                return { ...session, isrunning: true };
              })
            ]));
            return changed ? next : current;
          });
          updateSessionUi(sessionid, (current) => rightSidebarCleared({ ...current, agentRunning: true, cotWork: undefined }));
          return;
        }
        const session = attachSessionRow ?? Object.values(sessionsByProject).flat().find((item) => item.sessionid === sessionid);
        if (getSocket()?.isOpen() && session) {
          updateSessionUi(sessionid, (current) => ({ ...current, pendingAttachRequest: { sessionid, text: requestText, model, attachments: encodedAttachments } }));
          updateSessionUi(sessionid, rightSidebarCleared);
          if (attachSession(session)) return;
          updateSessionUi(sessionid, (current) => ({ ...current, pendingAttachRequest: undefined }));
        }
        finishSubmitAction();
        updateSessionUi(sessionid, (current) => ({ ...current, agentRunning: false, chatMessages: withoutPendingUserChatMessages(current.chatMessages) }));
        setSessionNotice(t[RSC.APP_STATUS_SOCKET_REQUIRED_ALERT]);
      };

      if (draftProject) {
        if (socketState === "connected") {
          const model = toModelConfig(selectedModel);
          updateActiveUi((current) => ({ ...current, pendingInitialRequest: { text: requestText, model, attachments: encodedAttachments } }));
          if (getSocket()?.createSession({
            userid: project.userid,
            projectName: project.projectName,
            model,
            initialInput: { text: requestText, ...(encodedAttachments.length ? { attachments: encodedAttachments } : {}) }
          })) return;
          updateActiveUi((current) => ({ ...current, pendingInitialRequest: undefined }));
        }
        void createProjectSession(project, { model: toModelConfig(selectedModel) }).then((session) => {
          const previousUiKey = activeUiKey;
          if (previousUiKey) {
            sessionUiManagerRef.current.promoteToSession(session.sessionid, previousUiKey);
            setSessionUiByKey(sessionUiManagerRef.current.snapshot);
          }
          setSessionsByProject((current) => ({
            ...current,
            [project.projectName]: [session, ...(current[project.projectName] ?? []).filter((item) => item.sessionid !== session.sessionid)]
          }));
          activeUiKeyRef.current = session.sessionid;
          draftSessionProjectIdRef.current = undefined;
          setDraftSessionProjectId(undefined);
          setActiveSessionId(session.sessionid);
          updateSessionUi(session.sessionid, rightSidebarCleared);
          finishAction(activeSubmitActionKey);
          activeSubmitActionKey = `session-submit:${session.sessionid}`;
          startAction(activeSubmitActionKey);
          sendMessage(session.sessionid, session);
        }).catch((error) => {
          const message = error instanceof Error && error.message ? error.message : t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT];
          finishSubmitAction();
          updateActiveUi((current) => ({ ...current, agentRunning: false, chatMessages: withoutPendingUserChatMessages(current.chatMessages), sessionError: message, notice: message }));
        });
        return;
      }

      if (!activeSessionId) {
        finishSubmitAction();
        updateActiveUi((current) => ({ ...current, agentRunning: false, chatMessages: withoutPendingUserChatMessages(current.chatMessages), notice: t[RSC.APP_STATUS_NO_ACTIVE_PROJECT_ALERT] }));
        return;
      }
      sendMessage(activeSessionId);
    })().catch((error) => {
      const message = error instanceof Error && error.message ? error.message : t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT];
      finishSubmitAction();
      updateActiveUi((current) => ({ ...current, agentRunning: false, chatMessages: withoutPendingUserChatMessages(current.chatMessages), sessionError: message, notice: message }));
      setChatInput(text);
      setChatAttachments(pendingAttachments);
    });
  };

  return {
    sessionInterruptActionKey,
    sessionSubmitActionKey,
    submitChatRequest
  };
}

function withThinkingMarker(text: string, effort: unknown): string {
  if (effort !== "low" && effort !== "medium" && effort !== "high") {
    return text;
  }
  return `[[NDX_THINKING_${effort}]]\n${text}`;
}

function withRewriterMarker(text: string, enabled: boolean): string {
  return enabled ? `${text.trimEnd()}\n[[rewriter]]`.trim() : text;
}
