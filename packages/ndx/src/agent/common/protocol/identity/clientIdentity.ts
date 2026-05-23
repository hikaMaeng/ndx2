export const NDX_CLIENT_ID_QUERY_PARAM = "clientid";

export type NDXClientId = string;

/** Returns true when a submitted client id is a UUID. */
export function isNDXClientId(value: unknown): value is NDXClientId {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  );
}
