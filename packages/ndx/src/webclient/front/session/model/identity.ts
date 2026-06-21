import type { NDXSessionCreatedMessage } from "ndx/common/protocol";
import type { NDXAgentWebSession } from "ndx/webclient/common";

export type SessionIdentityModel =
  | {
    kind: "draft";
    key: string;
    projectName: string;
  }
  | {
    kind: "session";
    key: string;
    sessionid: string;
    projectName: string;
  };

export function draftSessionModelKey(projectName: string): string {
  return `draft:${projectName}`;
}

export function createDraftSessionIdentity(projectName: string): SessionIdentityModel {
  return {
    kind: "draft",
    key: draftSessionModelKey(projectName),
    projectName
  };
}

export function createSessionIdentityFromRow(session: NDXAgentWebSession): SessionIdentityModel {
  return {
    kind: "session",
    key: session.sessionid,
    sessionid: session.sessionid,
    projectName: session.projectname
  };
}

export function createSessionIdentityFromCreated(message: NDXSessionCreatedMessage): SessionIdentityModel {
  return {
    kind: "session",
    key: message.sessionid,
    sessionid: message.sessionid,
    projectName: message.projectname
  };
}
