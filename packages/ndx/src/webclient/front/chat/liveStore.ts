import { Emitter } from "../model/Emitter.js";
import type { ModelUpdate } from "../model/SliceModel.js";
import { createSessionUiState, type SessionUiState } from "../session/uiState.js";
import type { SelectedModelConfig } from "../model/config.js";
import {
  chatModelToUiState,
  createChatDraftModel,
  createChatFolderModel,
  ensureChatModel,
  setChatModelSelectedModel,
  type ChatInstanceModel,
  type ChatModelSnapshot
} from "./model.js";

export class ChatSurfaceModelStore extends Emitter {
  #snapshot: ChatModelSnapshot = {};

  get snapshot(): ChatModelSnapshot {
    return this.#snapshot;
  }

  setSnapshot(update: ModelUpdate<ChatModelSnapshot>): void {
    this.#snapshot = typeof update === "function" ? (update as (current: ChatModelSnapshot) => ChatModelSnapshot)(this.#snapshot) : update;
    this.emit();
  }

  uiForKey(key: string | undefined): SessionUiState {
    const model = key ? this.#snapshot[key] : undefined;
    return model ? chatModelToUiState(model) : createSessionUiState();
  }

  modelForKey(key: string | undefined): ChatInstanceModel | undefined {
    return key ? this.#snapshot[key] : undefined;
  }

  setSelectedModel(key: string, update: ModelUpdate<SelectedModelConfig>): void {
    this.setSnapshot((current) => {
      const ensured = ensureChatModel(current, key);
      const model = ensured[key];
      if (!model) return ensured;
      const nextModel = typeof update === "function" ? (update as (current: SelectedModelConfig) => SelectedModelConfig)(model.composer.selectedModel) : update;
      return { ...ensured, [key]: setChatModelSelectedModel(model, nextModel) };
    });
  }

  updateUi(key: string, update: (current: SessionUiState) => SessionUiState, fallbackFolderId = ""): void {
    this.setSnapshot((current) => {
      const ensured = ensureChatModel(current, key);
      const model = ensured[key] ?? (key.startsWith("chat-draft:") ? createChatDraftModel(key.slice("chat-draft:".length)) : createChatFolderModel(fallbackFolderId));
      return { ...ensured, [key]: chatModelWithUi(model, update(chatModelToUiState(model))) };
    });
  }
}

function chatModelWithUi(model: ChatInstanceModel, ui: SessionUiState): ChatInstanceModel {
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

let chatSurfaceModelStore: ChatSurfaceModelStore | undefined;

export function getChatSurfaceModelStore(): ChatSurfaceModelStore {
  chatSurfaceModelStore ??= new ChatSurfaceModelStore();
  return chatSurfaceModelStore;
}
