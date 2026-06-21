import type { NDXAgentWebChatSession, NDXAgentWebSession, NDXWebClientProject } from "ndx/webclient/common";
import type { NDXSessionDeletedMessage, NDXSessionListChangedMessage } from "../project/socketProtocol.js";
import { SliceModel, type ModelUpdate } from "../model/SliceModel.js";

export type WebClientSurface =
  | { kind: "empty"; revision: number }
  | { kind: "project"; projectName: string; revision: number }
  | { kind: "project-session"; projectName: string; sessionId: string; revision: number }
  | { kind: "project-draft"; projectName: string; revision: number }
  | { kind: "chat-folder"; folderId: string; revision: number }
  | { kind: "chat-session"; folderId: string; sessionId: string; revision: number }
  | { kind: "chat-draft"; folderId: string; revision: number }
  | { kind: "settings"; revision: number; tab: "models" };

export type WebClientModalRequest =
  | { kind: "model"; sourceSurfaceKey: string; revision: number }
  | { kind: "project-warning"; title: string; message: string; revision: number }
  | { kind: "session-rename"; projectName: string; sessionId: string; revision: number };

export type WebClientModalCommand =
  | { kind: "model"; sourceSurfaceKey: string }
  | { kind: "project-warning"; title: string; message: string }
  | { kind: "session-rename"; projectName: string; sessionId: string };

export type WebClientProjectApi = {
  applySessionDeleted: (message: NDXSessionDeletedMessage) => void;
  reloadChangedSessionList: (message: NDXSessionListChangedMessage) => void;
  refreshSessions: () => Promise<void>;
  setProjectWarning: (message: string) => void;
  setProjectWarningTitle: (message: string) => void;
  setSessionsByProject: (update: ModelUpdate<Record<string, NDXAgentWebSession[]>>) => void;
};

export type WebClientBridgeSnapshot = {
  deleteSessionRequest?: { project: NDXWebClientProject; revision: number; session: NDXAgentWebSession };
  modalRequests: WebClientModalRequest[];
  pendingActions: Set<string>;
  sessionsByProject: Record<string, NDXAgentWebSession[]>;
  sessionsByChatFolder: Record<string, NDXAgentWebChatSession[]>;
  surface: WebClientSurface;
};

export class WebClientBridge {
  readonly deleteSessionRequest = new SliceModel<WebClientBridgeSnapshot["deleteSessionRequest"]>(undefined);
  readonly modalRequests = new SliceModel<WebClientModalRequest[]>([]);
  readonly pendingActions = new SliceModel<Set<string>>(new Set());
  readonly sessionsByProject = new SliceModel<Record<string, NDXAgentWebSession[]>>({});
  readonly sessionsByChatFolder = new SliceModel<Record<string, NDXAgentWebChatSession[]>>({});
  readonly surface = new SliceModel<WebClientSurface>({ kind: "empty", revision: 0 });
  #revision = 0;
  #projectApi?: WebClientProjectApi;

  getSnapshot = (): WebClientBridgeSnapshot => ({
    deleteSessionRequest: this.deleteSessionRequest.value,
    modalRequests: this.modalRequests.value,
    pendingActions: this.pendingActions.value,
    sessionsByProject: this.sessionsByProject.value,
    sessionsByChatFolder: this.sessionsByChatFolder.value,
    surface: this.surface.value
  });

  openProject(projectName: string): void {
    this.setSurface({ kind: "project", projectName, revision: this.nextRevision() });
  }

  clearSurface(): void {
    this.setSurface({ kind: "empty", revision: this.nextRevision() });
  }

  openProjectSession(projectName: string, sessionId: string): void {
    this.setSurface({ kind: "project-session", projectName, sessionId, revision: this.nextRevision() });
  }

  openProjectDraft(projectName: string): void {
    this.setSurface({ kind: "project-draft", projectName, revision: this.nextRevision() });
  }

  openChatFolder(folderId: string): void {
    this.setSurface({ kind: "chat-folder", folderId, revision: this.nextRevision() });
  }

  openChatSession(folderId: string, sessionId: string): void {
    this.setSurface({ kind: "chat-session", folderId, sessionId, revision: this.nextRevision() });
  }

  openChatDraft(folderId: string): void {
    this.setSurface({ kind: "chat-draft", folderId, revision: this.nextRevision() });
  }

  openSettings(tab: "models" = "models"): void {
    this.setSurface({ kind: "settings", tab, revision: this.nextRevision() });
  }

  openModal(request: WebClientModalCommand): void {
    this.modalRequests.set([
      ...this.modalRequests.value.filter((item) => item.kind !== request.kind),
      { ...request, revision: this.nextRevision() } as WebClientModalRequest
    ]);
  }

  requestProjectSessionDelete(project: NDXWebClientProject, session: NDXAgentWebSession): void {
    this.deleteSessionRequest.set({ project, session, revision: this.nextRevision() });
  }

  hasPendingAction(key: string): boolean {
    return this.pendingActions.value.has(key);
  }

  startAction(key: string): boolean {
    if (this.pendingActions.value.has(key)) return false;
    this.pendingActions.set(new Set(this.pendingActions.value).add(key));
    return true;
  }

  finishAction(key: string): void {
    if (!this.pendingActions.value.has(key)) return;
    const pendingActions = new Set(this.pendingActions.value);
    pendingActions.delete(key);
    this.pendingActions.set(pendingActions);
  }

  setPendingActions(update: ModelUpdate<Set<string>>): void {
    this.pendingActions.set(update);
  }

  closeModal(kind: WebClientModalRequest["kind"]): void {
    this.modalRequests.set(this.modalRequests.value.filter((item) => item.kind !== kind));
  }

  registerProjectApi(api: WebClientProjectApi): () => void {
    this.#projectApi = api;
    return () => {
      if (this.#projectApi === api) {
        this.#projectApi = undefined;
      }
    };
  }

  getProjectApi(): WebClientProjectApi | undefined {
    return this.#projectApi;
  }

  setProjectSessionsByProject(sessionsByProject: Record<string, NDXAgentWebSession[]>): void {
    this.sessionsByProject.set(sessionsByProject);
  }

  private setSurface(surface: WebClientSurface): void {
    this.surface.set(surface);
  }

  private nextRevision(): number {
    this.#revision += 1;
    return this.#revision;
  }
}
