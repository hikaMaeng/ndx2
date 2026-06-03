import { SESSION_TOKEN_MAX_AGE_DAYS } from "./createSessionToken.js";
import type { NDXDatabase, NDXSessionTokenGrant } from "./types.js";

export async function getSessionTokenGrant(database: NDXDatabase, token: string, now = new Date()): Promise<NDXSessionTokenGrant | undefined> {
  const result = await database.query<NDXSessionTokenGrant>(
    `
SELECT
  sessiontoken.token,
	  sessiontoken.createdat,
	  sessiontoken.sessionid,
	  "session".userid,
	  "session".projectname
FROM sessiontoken
JOIN "session" ON "session".sessionid = sessiontoken.sessionid
WHERE sessiontoken.token = $1
  AND sessiontoken.createdat >= $2::timestamptz - interval '5 days';
`,
    [token, now.toISOString()]
  );
  const grant = result.rows[0];
  database.logger?.debug("agent.server.session_token.get.complete", { token, found: Boolean(grant), maxAgeDays: SESSION_TOKEN_MAX_AGE_DAYS });
  return grant;
}
