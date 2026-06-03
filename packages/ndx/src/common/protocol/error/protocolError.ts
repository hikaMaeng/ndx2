export const NDX_PROTOCOL_ERROR = "protocol.error";

export type NDXProtocolErrorMessage = {
  type: typeof NDX_PROTOCOL_ERROR;
  error: string;
};
