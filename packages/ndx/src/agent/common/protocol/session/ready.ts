export const NDX_SESSION_READY = "session.ready";

export type NDXSessionReadyMessage = {
  type: typeof NDX_SESSION_READY;
  clientid: string;
  userid: string;
  projectId: string;
  projectPath: string;
};
