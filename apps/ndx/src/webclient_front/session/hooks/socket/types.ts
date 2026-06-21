import type React from "react";
import type { ProtocolEventUiText, SessionModelRoutedMessage } from "ndx/webclient/front";
import type {
  NDXSessionClientRequestClosedMessage,
  NDXSessionClientRequestMessage,
  NDXSessionBranchCreatedMessage,
  NDXSessionIterationSummary,
  NDXSessionSkillListResultMessage,
  NDXSessionTurnDeletedMessage
} from "ndx/common/protocol";
import type { NDXAgentWebMetadataResponse, NDXAgentWebSession, NDXWebClientStateDocument } from "ndx/webclient/common";
import type { SessionUiState, SocketState, TurnFlowState } from "ndx/webclient/front";
import type { NDXSessionDeletedMessage, NDXSessionListChangedMessage, NDXSessionRenamedMessage } from "../../../menu/project/socket/projectSocket";
import type { SessionSocketClient } from "../../socket/sessionSocket";

export type SessionUiManagerRef = React.MutableRefObject<{
  findKey: (predicate: (ui: SessionUiState) => boolean) => string | undefined;
  get: (key: string) => SessionUiState | undefined;
  promoteToSession: (sessionid: string, previousKey: string) => void;
  snapshot: Record<string, SessionUiState>;
}>;

export type UseSessionSocketControllerOptions = {
  activeSession?: NDXAgentWebSession;
  activeSessionId?: string;
  activeSessionIdRef: React.MutableRefObject<string | undefined>;
  activeUi?: SessionUiState;
  activeUiKeyRef: React.MutableRefObject<string | undefined>;
  clientid: string;
  clearSessionError: () => void;
  draftSessionProjectId?: string;
  draftSessionProjectIdRef: React.MutableRefObject<string | undefined>;
  finishAction: (key: string) => void;
  metadata: Partial<NDXAgentWebMetadataResponse>;
  pendingActionsRef: React.MutableRefObject<Set<string>>;
  project: {
    applySessionDeleted: (message: NDXSessionDeletedMessage) => void;
    reloadChangedSessionList: (message: NDXSessionListChangedMessage) => void;
    refreshSessions: () => Promise<void>;
    openProjectSession: (projectName: string, sessionid: string) => void;
    setSessionsByProject: React.Dispatch<React.SetStateAction<Record<string, NDXAgentWebSession[]>>>;
  };
  saveState: (nextState: NDXWebClientStateDocument) => void;
  sessionRename: {
    applyProtocolErrorFailure: () => void;
    applyRenamed: (message: NDXSessionRenamedMessage) => void;
  };
  onClientRequest: (message: NDXSessionClientRequestMessage) => void;
  onClientRequestClosed: (message: NDXSessionClientRequestClosedMessage) => void;
  attachedSessionIdsRef: React.MutableRefObject<Set<string>>;
  sessionUiManagerRef: SessionUiManagerRef;
  setActiveSessionError: (message: string) => void;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setAgentRunning: (running: boolean) => void;
  setDraftSessionProjectId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setLastProtocolEvent: React.Dispatch<React.SetStateAction<string>>;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
  setPendingActions: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSessionNotice: (message: string) => void;
  setAttachedSessionIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSessionUiByKey: React.Dispatch<React.SetStateAction<Record<string, SessionUiState>>>;
  setSocketState: React.Dispatch<React.SetStateAction<SocketState>>;
  setTurnFlows: (update: SessionUiState["turnFlows"] | ((current: SessionUiState["turnFlows"]) => SessionUiState["turnFlows"])) => void;
  socketRef: React.MutableRefObject<SessionSocketClient | null>;
  socketState: SocketState;
  stateRef: React.MutableRefObject<NDXWebClientStateDocument>;
  t: Record<string, string>;
  onSkillListReceived: (skills: NDXSessionSkillListResultMessage["skills"]) => void;
  applyRoutedSessionMessage: (message: SessionModelRoutedMessage, text: ProtocolEventUiText) => void;
  updateActiveUi: (update: (current: SessionUiState) => SessionUiState) => void;
  updateSessionUi: (key: string, update: (current: SessionUiState) => SessionUiState) => void;
  upsertSessionModel: (session: NDXAgentWebSession) => void;
};

export type SessionSocketControllerActions = {
  attachSession: (session: NDXAgentWebSession) => boolean;
  createBranch: (sessionid: string, inputDataId: string) => boolean;
  deleteTurn: (sessionid: string, inputDataId: string) => boolean;
  refreshSkillList: () => boolean;
  toggleIterationDetail: (turn: TurnFlowState, iteration: Pick<NDXSessionIterationSummary, "iteration">, open: boolean, userInitiated?: boolean) => void;
  toggleTurnDetail: (turn: TurnFlowState, open: boolean) => void;
};

export type SessionHistoryMutationMessage = NDXSessionBranchCreatedMessage | NDXSessionTurnDeletedMessage;
