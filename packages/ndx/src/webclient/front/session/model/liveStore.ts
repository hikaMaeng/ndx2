import type { NDXCotWorkContents } from "ndx/common/protocol";
import type { NDXAgentWebSession } from "ndx/webclient/common";
import { Emitter } from "../../model/Emitter.js";
import { SliceModel, type ModelUpdate } from "../../model/SliceModel.js";
import type { ChatMessage, NDXAgentWebContextUsage } from "../chat.js";
import { createSessionUiState, type SessionAttachmentDraft, type SessionUiState } from "../uiState.js";
import type { ProtocolEventUiText } from "../protocolEventReducer.js";
import type { SelectedModelConfig } from "../../model/config.js";
import type { TurnFlowState } from "../turn/index.js";
import { createDraftSessionModel, createSessionModelFromRow } from "./create.js";
import { createSessionIdentityFromRow } from "./identity.js";
import { applyRoutedSessionMessageToStore, type SessionModelRoutedMessage } from "./store.js";
import { sessionModelToUiState, sessionModelWithUiState } from "./uiAdapter.js";
import type { SessionInstanceModel, SessionModelSnapshot } from "./types.js";

export class WebClientSessionModelStore extends Emitter {
  readonly activeSessionId = new SliceModel<string | undefined>(undefined);
  readonly draftSessionProjectId = new SliceModel<string | undefined>(undefined);
  #snapshot: SessionModelSnapshot = {};

  get snapshot(): SessionModelSnapshot {
    return this.#snapshot;
  }

  get activeUiKey(): string | undefined {
    return this.activeSessionId.value ?? (this.draftSessionProjectId.value ? `draft:${this.draftSessionProjectId.value}` : undefined);
  }

  sessionUiByKey(): Record<string, SessionUiState> {
    return Object.fromEntries(Object.entries(this.#snapshot).map(([key, model]) => [key, sessionModelToUiState(model)]));
  }

  activeUi(): SessionUiState | undefined {
    const key = this.activeUiKey;
    return key ? this.sessionUiByKey()[key] ?? createSessionUiState() : undefined;
  }

  surfaceKeys(): string[] {
    const activeUiKey = this.activeUiKey;
    return [...new Set([...Object.keys(this.#snapshot), ...(activeUiKey ? [activeUiKey] : [])])];
  }

  setSessionUiByKey(update: ModelUpdate<Record<string, SessionUiState>>): void {
    const currentUi = this.sessionUiByKey();
    const nextUi = typeof update === "function" ? (update as (current: Record<string, SessionUiState>) => Record<string, SessionUiState>)(currentUi) : update;
    const next: SessionModelSnapshot = {};
    for (const [key, ui] of Object.entries(nextUi)) {
      next[key] = sessionModelWithUiState(this.#snapshot[key] ?? modelForUiKey(key), ui);
    }
    this.#snapshot = next;
    this.emit();
  }

  updateSessionUi(key: string, update: (current: SessionUiState) => SessionUiState): void {
    const model = this.#snapshot[key] ?? modelForUiKey(key);
    this.#snapshot = {
      ...this.#snapshot,
      [key]: sessionModelWithUiState(model, update(sessionModelToUiState(model)))
    };
    this.emit();
  }

  updateActiveUi(update: (current: SessionUiState) => SessionUiState): void {
    const key = this.activeUiKey;
    if (!key) return;
    this.updateSessionUi(key, update);
  }

  applyRoutedSessionMessage(message: SessionModelRoutedMessage, text: ProtocolEventUiText): void {
    this.#snapshot = applyRoutedSessionMessageToStore(this.#snapshot, message, text);
    this.emit();
  }

  upsertSessionModel(session: NDXAgentWebSession): void {
    const existing = this.#snapshot[session.sessionid];
    const next = existing
      ? {
        ...existing,
        key: session.sessionid,
        identity: createSessionIdentityFromRow(session),
        metadata: session,
        runtime: {
          ...existing.runtime,
          agentRunning: Boolean(session.isrunning)
        }
      }
      : createSessionModelFromRow(session);
    this.#snapshot = { ...this.#snapshot, [session.sessionid]: next };
    this.emit();
  }

  setChatInput(value: string): void {
    this.updateActiveUi((current) => ({ ...current, chatInput: value }));
  }

  setChatAttachments(update: ModelUpdate<SessionAttachmentDraft[]>): void {
    this.updateActiveUi((current) => ({
      ...current,
      chatAttachments: typeof update === "function" ? (update as (current: SessionAttachmentDraft[]) => SessionAttachmentDraft[])(current.chatAttachments) : update
    }));
  }

  setSelectedModel(update: ModelUpdate<SelectedModelConfig>): void {
    this.updateActiveUi((current) => ({
      ...current,
      selectedModel: typeof update === "function" ? (update as (current: SelectedModelConfig) => SelectedModelConfig)(current.selectedModel) : update
    }));
  }

  setAgentRunning(running: boolean): void {
    this.updateActiveUi((current) => ({ ...current, agentRunning: running }));
  }

  setChatMessages(update: ModelUpdate<ChatMessage[]>): void {
    this.updateActiveUi((current) => ({
      ...current,
      chatMessages: typeof update === "function" ? (update as (current: ChatMessage[]) => ChatMessage[])(current.chatMessages) : update
    }));
  }

  setTurnFlows(update: ModelUpdate<TurnFlowState[]>): void {
    this.updateActiveUi((current) => ({
      ...current,
      turnFlows: typeof update === "function" ? (update as (current: TurnFlowState[]) => TurnFlowState[])(current.turnFlows) : update
    }));
  }

  setCotWork(work: NDXCotWorkContents | undefined): void {
    this.updateActiveUi((current) => ({ ...current, cotWork: work }));
  }

  setAutoScrollEnabled(enabled: boolean): void {
    this.updateActiveUi((current) => ({ ...current, autoScrollEnabled: enabled }));
  }

  setReportedContextUsage(update: ModelUpdate<NDXAgentWebContextUsage | undefined>): void {
    this.updateActiveUi((current) => ({
      ...current,
      reportedContextUsage: typeof update === "function" ? (update as (current?: NDXAgentWebContextUsage) => NDXAgentWebContextUsage | undefined)(current.reportedContextUsage) : update
    }));
  }

  setSessionNotice(message: string): void {
    this.updateActiveUi((current) => ({ ...current, notice: message }));
  }

  setActiveSessionError(message: string): void {
    this.updateActiveUi((current) => ({ ...current, sessionError: message }));
  }
}

function modelForUiKey(key: string): SessionInstanceModel {
  if (key.startsWith("draft:")) {
    return createDraftSessionModel(key.slice("draft:".length));
  }
  const placeholder = createDraftSessionModel("");
  return {
    ...sessionModelWithUiState(placeholder, createSessionUiState()),
    key,
    identity: {
      kind: "session",
      key,
      sessionid: key,
      userid: "",
      projectName: ""
    }
  };
}

let sessionModelStore: WebClientSessionModelStore | undefined;

export function getWebClientSessionModelStore(): WebClientSessionModelStore {
  sessionModelStore ??= new WebClientSessionModelStore();
  return sessionModelStore;
}
