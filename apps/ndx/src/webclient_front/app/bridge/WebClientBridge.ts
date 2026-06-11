import React from "react";
import type { NDXAgentWebChatSession, NDXAgentWebSession, NDXWebClientProject } from "ndx/webclient/common";
import type { NDXSessionDeletedMessage, NDXSessionListChangedMessage } from "../../menu/project/socket/projectSocket";

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
  | { kind: "project-user"; projectName: string; revision: number }
  | { kind: "project-warning"; title: string; message: string; revision: number }
  | { kind: "session-rename"; projectName: string; sessionId: string; revision: number };

export type WebClientModalCommand =
  | { kind: "model"; sourceSurfaceKey: string }
  | { kind: "project-user"; projectName: string }
  | { kind: "project-warning"; title: string; message: string }
  | { kind: "session-rename"; projectName: string; sessionId: string };

type WebClientBridgeSnapshot = {
  deleteSessionRequest?: { project: NDXWebClientProject; revision: number; session: NDXAgentWebSession };
  modalRequests: WebClientModalRequest[];
  pendingActions: Set<string>;
  sessionsByProject: Record<string, NDXAgentWebSession[]>;
  sessionsByChatFolder: Record<string, NDXAgentWebChatSession[]>;
  surface: WebClientSurface;
};

export type WebClientProjectApi = {
  applySessionDeleted: (message: NDXSessionDeletedMessage) => void;
  reloadChangedSessionList: (message: NDXSessionListChangedMessage) => void;
  refreshSessions: () => Promise<void>;
  setProjectWarning: (message: string) => void;
  setProjectWarningTitle: (message: string) => void;
  setSessionsByProject: React.Dispatch<React.SetStateAction<Record<string, NDXAgentWebSession[]>>>;
};

export class WebClientBridge {
  private listeners = new Set<() => void>();
  private revision = 0;
  private projectApi?: WebClientProjectApi;
  private snapshot: WebClientBridgeSnapshot = {
    modalRequests: [],
    pendingActions: new Set(),
    sessionsByProject: {},
    sessionsByChatFolder: {},
    surface: { kind: "empty", revision: 0 }
  };

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  openProject(projectName: string) {
    this.setSurface({ kind: "project", projectName, revision: this.nextRevision() });
  }

  clearSurface() {
    this.setSurface({ kind: "empty", revision: this.nextRevision() });
  }

  openProjectSession(projectName: string, sessionId: string) {
    this.setSurface({ kind: "project-session", projectName, sessionId, revision: this.nextRevision() });
  }

  openProjectDraft(projectName: string) {
    this.setSurface({ kind: "project-draft", projectName, revision: this.nextRevision() });
  }

  openChatFolder(folderId: string) {
    this.setSurface({ kind: "chat-folder", folderId, revision: this.nextRevision() });
  }

  openChatSession(folderId: string, sessionId: string) {
    this.setSurface({ kind: "chat-session", folderId, sessionId, revision: this.nextRevision() });
  }

  openChatDraft(folderId: string) {
    this.setSurface({ kind: "chat-draft", folderId, revision: this.nextRevision() });
  }

  openSettings(tab: "models" = "models") {
    this.setSurface({ kind: "settings", tab, revision: this.nextRevision() });
  }

  openModal(request: WebClientModalCommand) {
    this.snapshot = {
      ...this.snapshot,
      modalRequests: [...this.snapshot.modalRequests.filter((item) => item.kind !== request.kind), { ...request, revision: this.nextRevision() } as WebClientModalRequest]
    };
    this.emit();
  }

  requestProjectSessionDelete(project: NDXWebClientProject, session: NDXAgentWebSession) {
    this.snapshot = { ...this.snapshot, deleteSessionRequest: { project, session, revision: this.nextRevision() } };
    this.emit();
  }

  hasPendingAction(key: string) {
    return this.snapshot.pendingActions.has(key);
  }

  startAction(key: string) {
    if (this.snapshot.pendingActions.has(key)) return false;
    this.snapshot = { ...this.snapshot, pendingActions: new Set(this.snapshot.pendingActions).add(key) };
    this.emit();
    return true;
  }

  finishAction(key: string) {
    if (!this.snapshot.pendingActions.has(key)) return;
    const pendingActions = new Set(this.snapshot.pendingActions);
    pendingActions.delete(key);
    this.snapshot = { ...this.snapshot, pendingActions };
    this.emit();
  }

  setPendingActions(update: React.SetStateAction<Set<string>>) {
    const pendingActions = typeof update === "function" ? update(this.snapshot.pendingActions) : update;
    this.snapshot = { ...this.snapshot, pendingActions };
    this.emit();
  }

  closeModal(kind: WebClientModalRequest["kind"]) {
    this.snapshot = {
      ...this.snapshot,
      modalRequests: this.snapshot.modalRequests.filter((item) => item.kind !== kind)
    };
    this.emit();
  }

  registerProjectApi(api: WebClientProjectApi) {
    this.projectApi = api;
    return () => {
      if (this.projectApi === api) {
        this.projectApi = undefined;
      }
    };
  }

  getProjectApi() {
    return this.projectApi;
  }

  setProjectSessionsByProject(sessionsByProject: Record<string, NDXAgentWebSession[]>) {
    this.snapshot = { ...this.snapshot, sessionsByProject };
    this.emit();
  }

  private setSurface(surface: WebClientSurface) {
    this.snapshot = { ...this.snapshot, surface };
    this.emit();
  }

  private nextRevision() {
    this.revision += 1;
    return this.revision;
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function useWebClientBridge() {
  const bridgeRef = React.useRef<WebClientBridge | null>(null);
  if (!bridgeRef.current) {
    bridgeRef.current = new WebClientBridge();
  }
  return bridgeRef.current;
}

export function useBridgeSurface(bridge: WebClientBridge) {
  return React.useSyncExternalStore(bridge.subscribe, () => bridge.getSnapshot().surface, () => bridge.getSnapshot().surface);
}

export function useBridgeModals(bridge: WebClientBridge) {
  return React.useSyncExternalStore(bridge.subscribe, () => bridge.getSnapshot().modalRequests, () => bridge.getSnapshot().modalRequests);
}

export function useBridgeProjectSessions(bridge: WebClientBridge) {
  return React.useSyncExternalStore(bridge.subscribe, () => bridge.getSnapshot().sessionsByProject, () => bridge.getSnapshot().sessionsByProject);
}

export function useBridgeProjectSessionDeleteRequest(bridge: WebClientBridge) {
  return React.useSyncExternalStore(bridge.subscribe, () => bridge.getSnapshot().deleteSessionRequest, () => bridge.getSnapshot().deleteSessionRequest);
}

export function useBridgePendingActions(bridge: WebClientBridge) {
  return React.useSyncExternalStore(bridge.subscribe, () => bridge.getSnapshot().pendingActions, () => bridge.getSnapshot().pendingActions);
}
