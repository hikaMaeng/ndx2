import type { NDXAgentWebChatSession, NDXAgentWebSessionData } from "ndx/webclient/common";
import { fromModelConfig, type SelectedModelConfig } from "../model/config.js";
import { createSessionComposerModel, type SessionComposerModel } from "../session/model/composer.js";
import { createSessionHistoryModel, type SessionHistoryModel } from "../session/model/history.js";
import { createSessionRuntimeModel, type SessionRuntimeModel } from "../session/model/runtime.js";
import { createSessionViewportModel, type SessionViewportModel } from "../session/model/viewport.js";
import { createSessionUiState, type SessionUiState } from "../session/uiState.js";
import { chatMessagesFromSessionDataRows } from "../session/chat.js";

export type ChatInstanceModel = {
  key: string;
  identity:
    | { kind: "folder"; key: string; folderId: string }
    | { kind: "draft"; key: string; folderId: string }
    | { kind: "session"; key: string; sessionId: string; folderId?: string };
  metadata?: NDXAgentWebChatSession;
  composer: SessionComposerModel;
  history: Pick<SessionHistoryModel, "messages">;
  runtime: Pick<SessionRuntimeModel, "agentRunning" | "notice" | "error">;
  viewport: SessionViewportModel;
};

export type ChatModelSnapshot = Record<string, ChatInstanceModel>;

export function chatFolderModelKey(folderId: string): string {
  return `chat-folder:${folderId}`;
}

export function chatDraftModelKey(folderId: string): string {
  return `chat-draft:${folderId}`;
}

export function chatSessionModelKey(sessionId: string): string {
  return `chat:${sessionId}`;
}

export function createChatFolderModel(folderId: string): ChatInstanceModel {
  const key = chatFolderModelKey(folderId);
  return {
    key,
    identity: { kind: "folder", key, folderId },
    composer: createSessionComposerModel(),
    history: { messages: [] },
    runtime: { agentRunning: false, notice: "", error: "" },
    viewport: createSessionViewportModel()
  };
}

export function createChatDraftModel(folderId: string): ChatInstanceModel {
  const key = chatDraftModelKey(folderId);
  return {
    key,
    identity: { kind: "draft", key, folderId },
    composer: createSessionComposerModel(),
    history: { messages: [] },
    runtime: { agentRunning: false, notice: "", error: "" },
    viewport: createSessionViewportModel()
  };
}

export function createChatSessionModel(session: NDXAgentWebChatSession): ChatInstanceModel {
  const key = chatSessionModelKey(session.chatsessionid);
  return {
    key,
    identity: { kind: "session", key, sessionId: session.chatsessionid, folderId: session.folderid },
    metadata: session,
    composer: {
      ...createSessionComposerModel(),
      selectedModel: fromModelConfig(session.model)
    },
    history: createSessionHistoryModel(),
    runtime: { ...createSessionRuntimeModel(), agentRunning: Boolean(session.isrunning) },
    viewport: createSessionViewportModel()
  };
}

export function chatModelToUiState(model: ChatInstanceModel): SessionUiState {
  return {
    ...createSessionUiState(),
    chatInput: model.composer.input,
    selectedModel: model.composer.selectedModel,
    chatMessages: model.history.messages,
    agentRunning: model.runtime.agentRunning,
    notice: model.runtime.notice,
    sessionError: model.runtime.error,
    autoScrollEnabled: model.viewport.autoScrollEnabled,
    chatScrollTop: model.viewport.chatScrollTop
  };
}

export function chatModelWithUiState(model: ChatInstanceModel, ui: SessionUiState): ChatInstanceModel {
  return {
    ...model,
    composer: {
      ...model.composer,
      input: ui.chatInput,
      selectedModel: ui.selectedModel
    },
    history: {
      messages: ui.chatMessages
    },
    runtime: {
      agentRunning: ui.agentRunning,
      notice: ui.notice,
      error: ui.sessionError
    },
    viewport: {
      autoScrollEnabled: ui.autoScrollEnabled,
      chatScrollTop: ui.chatScrollTop
    }
  };
}

export function ensureChatModel(snapshot: ChatModelSnapshot, key: string): ChatModelSnapshot {
  if (snapshot[key]) return snapshot;
  if (key.startsWith("chat-draft:")) {
    return { ...snapshot, [key]: createChatDraftModel(key.slice("chat-draft:".length)) };
  }
  if (key.startsWith("chat-folder:")) {
    return { ...snapshot, [key]: createChatFolderModel(key.slice("chat-folder:".length)) };
  }
  return snapshot;
}

export function updateChatModel(snapshot: ChatModelSnapshot, key: string, update: (model: ChatInstanceModel) => ChatInstanceModel): ChatModelSnapshot {
  const model = snapshot[key];
  return model ? { ...snapshot, [key]: update(model) } : snapshot;
}

export function applyChatSessionLoaded(model: ChatInstanceModel, session: NDXAgentWebChatSession, rows: NDXAgentWebSessionData[]): ChatInstanceModel {
  const loaded = createChatSessionModel(session);
  return {
    ...loaded,
    ...model,
    key: chatSessionModelKey(session.chatsessionid),
    identity: { kind: "session", key: chatSessionModelKey(session.chatsessionid), sessionId: session.chatsessionid, folderId: session.folderid },
    metadata: session,
    composer: {
      ...model.composer,
      selectedModel: loaded.composer.selectedModel
    },
    history: {
      messages: chatMessagesFromSessionDataRows(rows)
    },
    runtime: {
      agentRunning: Boolean(session.isrunning),
      notice: session.isrunning ? "응답 수신 중..." : "채팅 세션을 불러왔습니다.",
      error: ""
    }
  };
}

export function applyChatRequestStarted(model: ChatInstanceModel, userText: string): ChatInstanceModel {
  const now = Date.now();
  return {
    ...model,
    composer: {
      ...model.composer,
      input: ""
    },
    history: {
      messages: [
        ...model.history.messages,
        { id: `pending-user:${now}`, role: "user", text: userText, attachments: [] },
        { id: "pending-assistant", role: "assistant", text: "응답 생성 중...", attachments: [] }
      ]
    },
    runtime: {
      agentRunning: true,
      notice: "응답 생성 중...",
      error: ""
    }
  };
}

export function applyChatStreamProgress(model: ChatInstanceModel): ChatInstanceModel {
  return {
    ...model,
    runtime: {
      ...model.runtime,
      agentRunning: true,
      notice: "응답 수신 중..."
    }
  };
}

export function applyChatRequestCompleted(model: ChatInstanceModel, session: NDXAgentWebChatSession, rows: NDXAgentWebSessionData[]): ChatInstanceModel {
  const loaded = applyChatSessionLoaded(model, session, rows);
  return {
    ...loaded,
    runtime: {
      agentRunning: false,
      notice: "응답이 완료되었습니다.",
      error: ""
    },
    composer: {
      ...loaded.composer,
      input: "",
      selectedModel: loaded.composer.selectedModel
    }
  };
}

export function applyChatRequestFailed(model: ChatInstanceModel, inputText: string, error: string): ChatInstanceModel {
  return {
    ...model,
    composer: {
      ...model.composer,
      input: inputText
    },
    runtime: {
      agentRunning: false,
      notice: "",
      error
    }
  };
}

export function setChatModelSelectedModel(model: ChatInstanceModel, selectedModel: SelectedModelConfig): ChatInstanceModel {
  return {
    ...model,
    composer: {
      ...model.composer,
      selectedModel
    }
  };
}
