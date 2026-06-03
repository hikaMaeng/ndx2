import type React from "react";
import type {
  NDXSessionClientRequestClosedMessage,
  NDXSessionClientRequestMessage,
  NDXSessionIterationSummary,
  NDXSessionSkillListResultMessage
} from "ndx/common/protocol";
import type { NDXAgentWebMetadataResponse, NDXAgentWebSession, NDXWebClientStateDocument } from "ndx/webclient/common";
import type { NDXAgentWebContextUsage, SessionUiState, SocketState, TurnFlowState } from "ndx/webclient/front";
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
    setSessionsByProject: React.Dispatch<React.SetStateAction<Record<string, NDXAgentWebSession[]>>>;
  };
  saveState: (nextState: NDXWebClientStateDocument) => void;
  sessionRename: {
    applyProtocolErrorFailure: () => void;
    applyRenamed: (message: NDXSessionRenamedMessage) => void;
  };
  onClientRequest: (message: NDXSessionClientRequestMessage) => void;
  onClientRequestClosed: (message: NDXSessionClientRequestClosedMessage) => void;
  sessionTokensRef: React.MutableRefObject<Record<string, string>>;
  sessionUiManagerRef: SessionUiManagerRef;
  setActiveSessionError: (message: string) => void;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setAgentRunning: (running: boolean) => void;
  setChatMessages: (update: SessionUiState["chatMessages"] | ((current: SessionUiState["chatMessages"]) => SessionUiState["chatMessages"])) => void;
  setCotWork: (work: SessionUiState["cotWork"]) => void;
  setDraftSessionProjectId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setLastProtocolEvent: React.Dispatch<React.SetStateAction<string>>;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
  setPendingActions: React.Dispatch<React.SetStateAction<Set<string>>>;
  setReportedContextUsage: (update: NDXAgentWebContextUsage | undefined | ((current?: NDXAgentWebContextUsage) => NDXAgentWebContextUsage | undefined)) => void;
  setSessionNotice: (message: string) => void;
  setSessionTokens: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setSessionUiByKey: React.Dispatch<React.SetStateAction<Record<string, SessionUiState>>>;
  setSocketState: React.Dispatch<React.SetStateAction<SocketState>>;
  setTurnFlows: (update: SessionUiState["turnFlows"] | ((current: SessionUiState["turnFlows"]) => SessionUiState["turnFlows"])) => void;
  socketRef: React.MutableRefObject<SessionSocketClient | null>;
  socketState: SocketState;
  stateRef: React.MutableRefObject<NDXWebClientStateDocument>;
  t: Record<string, string>;
  onSkillListReceived: (projectName: string, skills: NDXSessionSkillListResultMessage["skills"]) => void;
  updateActiveUi: (update: (current: SessionUiState) => SessionUiState) => void;
  updateSessionUi: (key: string, update: (current: SessionUiState) => SessionUiState) => void;
};

export type SessionSocketControllerActions = {
  attachSession: (session: NDXAgentWebSession) => boolean;
  refreshSkillList: () => boolean;
  toggleIterationDetail: (turn: TurnFlowState, iteration: Pick<NDXSessionIterationSummary, "iteration">, open: boolean, userInitiated?: boolean) => void;
  toggleTurnDetail: (turn: TurnFlowState, open: boolean) => void;
};
