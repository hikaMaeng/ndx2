import {
  NDX_ACCOUNT_SELECTED,
  NDX_ACCOUNT_SELECTION_REQUIRED,
  NDX_PROJECT_NEGOTIATED,
  NDX_PROJECT_NEGOTIATION_REQUIRED,
  NDX_PROTOCOL_ERROR,
  NDX_SESSION_CREATED,
  NDX_SESSION_EVENT,
  NDX_SESSION_HISTORY_SUMMARY_RESULT,
  NDX_SESSION_ITERATION_DETAIL_RESULT,
  NDX_SESSION_CLIENT_REQUEST,
  NDX_SESSION_CLIENT_REQUEST_CLOSED,
  NDX_SESSION_ATTACHED,
  NDX_SESSION_SKILL_LIST_RESULT,
  NDX_SESSION_SIDEBAR_ITEM,
  NDX_SESSION_TURN_DETAIL_RESULT,
  NDX_SESSION_READY,
  type NDXAccountSelectionRequiredMessage,
  type NDXProjectNegotiatedMessage,
  type NDXProtocolErrorMessage,
  type NDXSessionAttachedMessage,
  type NDXSessionCreatedMessage,
  type NDXSessionEventMessage,
  type NDXSessionHistorySummaryResultMessage,
  type NDXSessionIterationDetailResultMessage,
  type NDXSessionClientRequestClosedMessage,
  type NDXSessionClientRequestMessage,
  type NDXSessionClientResponseMessage,
  type NDXSessionCreateMessage,
  type NDXSessionModelConfig,
  type NDXSessionSkillListResultMessage,
  type NDXSessionSidebarItemMessage,
  type NDXSessionReadyMessage,
  type NDXSessionTurnDetailResultMessage
} from "ndx/common/protocol";
import { type NDXAgentWebMetadataResponse, type NDXWebClientProject, type NDXWebClientStateDocument } from "ndx/webclient/common";
import { selectSocketUserid, sessionAccountSelectMessage, sessionAttachMessage, sessionClientResponseMessage, sessionCreateMessage, sessionHistorySummaryMessage, sessionInputMessage, sessionInterruptMessage, sessionIterationDetailMessage, sessionProjectConfigureMessage, sessionSkillListMessage, sessionSocketUrl, sessionTurnDetailMessage, stateAfterSessionReady, type SocketState } from "ndx/webclient/front";
import { RSC } from "../resource";

export type SessionSocketClient = {
  socket: WebSocket;
  isOpen: () => boolean;
  attachSession: (input: { userid: string; projectName: string; sessionid: string }) => boolean;
  createSession: (input: Omit<NDXSessionCreateMessage, "type" | "language">) => boolean;
  sendInput: (connectionToken: string, text: string, model: NDXSessionModelConfig, attachments?: Array<{ name: string; mimeType: string; size: number; data: string }>) => boolean;
  sendInterrupt: (connectionToken: string) => boolean;
  requestSkillList: (connectionToken?: string) => boolean;
  requestHistorySummary: (connectionToken: string) => boolean;
  requestTurnDetail: (connectionToken: string, inputDataId: string) => boolean;
  requestIterationDetail: (connectionToken: string, inputDataId: string, iteration: number) => boolean;
  sendClientResponse: (input: Omit<NDXSessionClientResponseMessage, "type" | "language">) => boolean;
  close: () => void;
};

export type SessionSocketOptions = {
  clientid: string;
  metadata: Partial<NDXAgentWebMetadataResponse>;
  getState: () => NDXWebClientStateDocument;
  setState: (state: NDXWebClientStateDocument) => void;
  setSocketState: (state: SocketState | ((current: SocketState) => SocketState)) => void;
  setLastProtocolEvent: (event: string) => void;
  setNotice: (notice: string) => void;
  onSocketOpen: () => void;
  onSessionCreated: (message: NDXSessionCreatedMessage) => void;
  onSessionAttached: (message: NDXSessionAttachedMessage) => void;
  onSessionEvent: (message: NDXSessionEventMessage) => void;
  onHistorySummary: (message: NDXSessionHistorySummaryResultMessage) => void;
  onSkillList: (message: NDXSessionSkillListResultMessage) => void;
  onSidebarItem: (message: NDXSessionSidebarItemMessage) => void;
  onTurnDetail: (message: NDXSessionTurnDetailResultMessage) => void;
  onIterationDetail: (message: NDXSessionIterationDetailResultMessage) => void;
  onClientRequest: (message: NDXSessionClientRequestMessage) => void;
  onClientRequestClosed: (message: NDXSessionClientRequestClosedMessage) => void;
  onUnhandledMessage?: (message: { type?: string }) => boolean;
  onProtocolError?: (message: NDXProtocolErrorMessage) => void;
  onTransportError?: (message: string) => void;
  t: Record<string, string>;
};

export function openSessionSocket(options: SessionSocketOptions): SessionSocketClient | undefined {
  if (!options.metadata.session?.socketUrl) {
    options.setNotice(options.t[RSC.SESSION_SOCKET_OFFLINE_ALERT]);
    return undefined;
  }

  options.setNotice("");
  options.setSocketState("connecting");
  options.setLastProtocolEvent("");

  const socket = new WebSocket(sessionSocketUrl(options.metadata.session.socketUrl, options.clientid));
  let sessionReady = false;
  let intentionalClose = false;

  socket.addEventListener("open", () => {
    options.setSocketState("negotiating");
    options.onSocketOpen();
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as { type?: string };
    options.setLastProtocolEvent(message.type ?? "");

    if (message.type === NDX_ACCOUNT_SELECTION_REQUIRED) {
      const required = message as NDXAccountSelectionRequiredMessage;
      const state = options.getState();
      const userid = selectSocketUserid(required, state);
      if (!userid) {
        options.setSocketState("error");
        options.setNotice(required.error ?? options.t[RSC.SESSION_SOCKET_ERROR_ALERT]);
        return;
      }

      options.setState({ ...state, selectedUserid: userid });
      socket.send(JSON.stringify(sessionAccountSelectMessage(userid, state.locale)));
      return;
    }

    if (message.type === NDX_ACCOUNT_SELECTED) {
      options.setSocketState("negotiating");
      return;
    }

    if (message.type === NDX_PROJECT_NEGOTIATION_REQUIRED) {
      const project = options.getState().projects.find((item) => item.projectName === options.getState().activeProjectName);
      if (!project) {
        options.setNotice(options.t[RSC.APP_STATUS_NO_ACTIVE_PROJECT_ALERT]);
        return;
      }
      socket.send(JSON.stringify(sessionProjectConfigureMessage(project, options.getState().locale)));
      return;
    }

    if (message.type === NDX_PROJECT_NEGOTIATED) {
      const negotiated = message as NDXProjectNegotiatedMessage;
      options.setSocketState("negotiating");
      options.setNotice(`${options.t[RSC.SESSION_SOCKET_NEGOTIATED_PROJECT_LABEL]}: ${negotiated.projectName}`);
      return;
    }

    if (message.type === NDX_SESSION_READY) {
      const ready = message as NDXSessionReadyMessage;
      sessionReady = true;
      options.setSocketState("connected");
      options.setState(stateAfterSessionReady(options.getState(), ready, new Date().toISOString()));
      socket.send(JSON.stringify(sessionSkillListMessage(undefined, options.getState().locale)));
      return;
    }

    if (message.type === NDX_SESSION_CREATED) {
      options.onSessionCreated(message as NDXSessionCreatedMessage);
      return;
    }

    if (message.type === NDX_SESSION_ATTACHED) {
      options.onSessionAttached(message as NDXSessionAttachedMessage);
      return;
    }

    if (message.type === NDX_SESSION_EVENT) {
      options.onSessionEvent(message as NDXSessionEventMessage);
      return;
    }

    if (message.type === NDX_SESSION_HISTORY_SUMMARY_RESULT) {
      options.onHistorySummary(message as NDXSessionHistorySummaryResultMessage);
      return;
    }

    if (message.type === NDX_SESSION_SKILL_LIST_RESULT) {
      options.onSkillList(message as NDXSessionSkillListResultMessage);
      return;
    }

    if (message.type === NDX_SESSION_SIDEBAR_ITEM) {
      options.onSidebarItem(message as NDXSessionSidebarItemMessage);
      return;
    }

    if (message.type === NDX_SESSION_TURN_DETAIL_RESULT) {
      options.onTurnDetail(message as NDXSessionTurnDetailResultMessage);
      return;
    }

    if (message.type === NDX_SESSION_ITERATION_DETAIL_RESULT) {
      options.onIterationDetail(message as NDXSessionIterationDetailResultMessage);
      return;
    }

    if (message.type === NDX_SESSION_CLIENT_REQUEST) {
      options.onClientRequest(message as NDXSessionClientRequestMessage);
      return;
    }

    if (message.type === NDX_SESSION_CLIENT_REQUEST_CLOSED) {
      options.onClientRequestClosed(message as NDXSessionClientRequestClosedMessage);
      return;
    }

    if (options.onUnhandledMessage?.(message)) {
      return;
    }

    if (message.type === NDX_PROTOCOL_ERROR) {
      options.setSocketState("error");
      const protocolError = message as NDXProtocolErrorMessage;
      options.setNotice(protocolError.error);
      options.onProtocolError?.(protocolError);
    }
  });

  socket.addEventListener("close", () => {
    options.setSocketState((current) => (current === "connected" ? "idle" : current));
    if (!sessionReady && !intentionalClose) {
      const message = options.t[RSC.SESSION_SOCKET_ERROR_ALERT];
      options.setNotice(message);
      options.onTransportError?.(message);
    }
  });
  socket.addEventListener("error", () => {
    const message = options.t[RSC.SESSION_SOCKET_ERROR_ALERT];
    options.setSocketState("error");
    options.setNotice(message);
    options.onTransportError?.(message);
  });

  return {
    socket,
    isOpen: () => socket.readyState === WebSocket.OPEN,
    attachSession: (input) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify(sessionAttachMessage(input, options.getState().locale)));
      return true;
    },
    createSession: (input) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify(sessionCreateMessage(input, options.getState().locale)));
      return true;
    },
    sendInput: (connectionToken, text, model, attachments) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify(sessionInputMessage(connectionToken, text, model, attachments, options.getState().locale)));
      return true;
    },
    sendInterrupt: (connectionToken) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify(sessionInterruptMessage(connectionToken, options.getState().locale)));
      return true;
    },
    requestSkillList: (connectionToken) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify(sessionSkillListMessage(connectionToken, options.getState().locale)));
      return true;
    },
    requestHistorySummary: (connectionToken) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify(sessionHistorySummaryMessage(connectionToken, options.getState().locale)));
      return true;
    },
    requestTurnDetail: (connectionToken, inputDataId) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify(sessionTurnDetailMessage(connectionToken, inputDataId, options.getState().locale)));
      return true;
    },
    requestIterationDetail: (connectionToken, inputDataId, iteration) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify(sessionIterationDetailMessage(connectionToken, inputDataId, iteration, options.getState().locale)));
      return true;
    },
    sendClientResponse: (input) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify(sessionClientResponseMessage(input, options.getState().locale)));
      return true;
    },
    close: () => {
      intentionalClose = true;
      socket.close();
    }
  };
}
