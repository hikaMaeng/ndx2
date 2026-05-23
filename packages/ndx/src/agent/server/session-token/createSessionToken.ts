import { uuid7 } from "../../../common/uuid7/index.js";
import type { NDXDatabase, NDXSessionTokenRow } from "./types.js";

export const SESSION_TOKEN_MAX_AGE_DAYS = 5;

export async function pruneExpiredSessionTokens(database: NDXDatabase, now = new Date()): Promise<number> {
  const result = await database.query(
    `
DELETE FROM sessiontoken
WHERE createdat < $1::timestamptz - interval '5 days';
`,
    [now.toISOString()]
  );
  database.logger?.info("agent.server.session_token.prune.complete", { count: result.rowCount ?? 0 });
  return result.rowCount ?? 0;
}

export async function createSessionToken(database: NDXDatabase, sessionid: string, now = new Date()): Promise<NDXSessionTokenRow> {
  await pruneExpiredSessionTokens(database, now);
  const result = await database.query<NDXSessionTokenRow>(
    `
INSERT INTO sessiontoken (token, createdat, sessionid)
VALUES ($1, $2::timestamptz, $3)
RETURNING token, createdat, sessionid;
`,
    [uuid7(), now.toISOString(), sessionid]
  );
  if (!result.rows[0]) {
    throw new Error(`Session token was not created for session: ${sessionid}`);
  }
  database.logger?.info("agent.server.session_token.create.complete", { sessionid, token: result.rows[0].token });
  return result.rows[0];
}
