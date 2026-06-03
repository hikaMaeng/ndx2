import {
  NDX_ACCOUNT_SELECT,
  NDX_CLIENT_ID_QUERY_PARAM,
  NDX_PROJECT_CONFIGURE,
  NDX_SESSION_ATTACH,
  NDX_SESSION_CREATE,
  NDX_SESSION_HISTORY_SUMMARY,
  NDX_SESSION_INPUT,
  NDX_SESSION_INTERRUPT,
  NDX_SESSION_ITERATION_DETAIL,
  NDX_SESSION_CLIENT_RESPONSE,
  NDX_SESSION_SKILL_LIST,
  NDX_SESSION_TURN_DETAIL,
  type NDXAccountSelectMessage,
  type NDXAccountSelectionRequiredMessage,
  type NDXProjectConfigureMessage,
  type NDXSessionAttachMessage,
  type NDXSessionCreateMessage,
  type NDXSessionHistorySummaryMessage,
  type NDXSessionInputMessage,
  type NDXSessionIterationDetailMessage,
  type NDXSessionInterruptMessage,
  type NDXSessionClientResponseMessage,
  type NDXSessionModelConfig,
  type NDXSessionReadyMessage,
  type NDXSessionSkillListMessage,
  type NDXSessionTurnDetailMessage
} from "ndx/common/protocol";
import type { NDXWebClientProject, NDXWebClientStateDocument } from "ndx/webclient/common";

export function sessionSocketUrl(socketUrl: string, clientid: string) {
  const url = new URL(socketUrl);
  url.searchParams.set(NDX_CLIENT_ID_QUERY_PARAM, clientid);
  return url;
}

export function selectSocketUserid(required: NDXAccountSelectionRequiredMessage, state: NDXWebClientStateDocument) {
  const project = state.projects.find((item) => item.projectName === state.activeProjectName);
  return project?.userid && required.users.some((user) => user.userid === project.userid)
    ? project.userid
    : state.selectedUserid && required.users.some((user) => user.userid === state.selectedUserid)
      ? state.selectedUserid
      : required.users.find((user) => user.userid === "ndev")?.userid ?? required.users[0]?.userid;
}

export function sessionAccountSelectMessage(userid: string, language: NDXWebClientStateDocument["locale"]): NDXAccountSelectMessage {
  return { type: NDX_ACCOUNT_SELECT, userid, language };
}

export function sessionProjectConfigureMessage(project: Pick<NDXWebClientProject, "projectName">, language: NDXWebClientStateDocument["locale"]): NDXProjectConfigureMessage {
  return { type: NDX_PROJECT_CONFIGURE, projectName: project.projectName, language };
}

export function stateAfterSessionReady(state: NDXWebClientStateDocument, ready: NDXSessionReadyMessage, connectedAt: string): NDXWebClientStateDocument {
  return {
    ...state,
    selectedUserid: ready.userid,
    activeProjectName: ready.projectName,
    lastSession: {
      clientid: ready.clientid,
      userid: ready.userid,
      projectName: ready.projectName,
      connectedAt
    }
  };
}

export function sessionAttachMessage(input: Omit<NDXSessionAttachMessage, "type" | "language">, language: NDXWebClientStateDocument["locale"]): NDXSessionAttachMessage {
  return { type: NDX_SESSION_ATTACH, ...input, language };
}

export function sessionCreateMessage(input: Omit<NDXSessionCreateMessage, "type" | "language">, language: NDXWebClientStateDocument["locale"]): NDXSessionCreateMessage {
  return { type: NDX_SESSION_CREATE, ...input, language };
}

export function sessionInputMessage(connectionToken: string, text: string, model: NDXSessionModelConfig, attachments: NDXSessionInputMessage["attachments"], language: NDXWebClientStateDocument["locale"]): NDXSessionInputMessage {
  return { type: NDX_SESSION_INPUT, connectionToken, text, model, ...(attachments?.length ? { attachments } : {}), language };
}

export function sessionInterruptMessage(connectionToken: string, language: NDXWebClientStateDocument["locale"]): NDXSessionInterruptMessage {
  return { type: NDX_SESSION_INTERRUPT, connectionToken, language };
}

export function sessionSkillListMessage(connectionToken: string | undefined, language: NDXWebClientStateDocument["locale"]): NDXSessionSkillListMessage {
  return { type: NDX_SESSION_SKILL_LIST, ...(connectionToken ? { connectionToken } : {}), language };
}

export function sessionHistorySummaryMessage(connectionToken: string, language: NDXWebClientStateDocument["locale"]): NDXSessionHistorySummaryMessage {
  return { type: NDX_SESSION_HISTORY_SUMMARY, connectionToken, language };
}

export function sessionTurnDetailMessage(connectionToken: string, inputDataId: string, language: NDXWebClientStateDocument["locale"]): NDXSessionTurnDetailMessage {
  return { type: NDX_SESSION_TURN_DETAIL, connectionToken, inputDataId, language };
}

export function sessionIterationDetailMessage(connectionToken: string, inputDataId: string, iteration: number, language: NDXWebClientStateDocument["locale"]): NDXSessionIterationDetailMessage {
  return { type: NDX_SESSION_ITERATION_DETAIL, connectionToken, inputDataId, iteration, language };
}

export function sessionClientResponseMessage(input: Omit<NDXSessionClientResponseMessage, "type" | "language">, language: NDXWebClientStateDocument["locale"]): NDXSessionClientResponseMessage {
  return { type: NDX_SESSION_CLIENT_RESPONSE, ...input, language };
}
