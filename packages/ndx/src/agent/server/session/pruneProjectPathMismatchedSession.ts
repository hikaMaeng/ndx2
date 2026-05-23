import type { NDXDatabase } from "./types.js";

export type NDXProjectPathMismatchedSessionPruneResult = {
  sessionCount: number;
  sessionDataCount: number;
  tokenCount: number;
};

export async function pruneProjectPathMismatchedSession(
  database: NDXDatabase,
  userid: string,
  path: string,
  projectid: string
): Promise<NDXProjectPathMismatchedSessionPruneResult> {
  const tokenResult = await database.query(
    `
DELETE FROM sessiontoken
WHERE sessionid IN (
  SELECT sessionid
  FROM "session"
  WHERE userid = $1
    AND path = $2
    AND projectid <> $3
)
RETURNING 1;
`,
    [userid, path, projectid]
  );
  const sessionDataResult = await database.query(
    `
DELETE FROM sessiondata
WHERE sessionid IN (
  SELECT sessionid
  FROM "session"
  WHERE userid = $1
    AND path = $2
    AND projectid <> $3
)
RETURNING 1;
`,
    [userid, path, projectid]
  );
  const sessionResult = await database.query(
    `
DELETE FROM "session"
WHERE userid = $1
  AND path = $2
  AND projectid <> $3
RETURNING 1;
`,
    [userid, path, projectid]
  );

  return {
    sessionCount: sessionResult.rowCount ?? 0,
    sessionDataCount: sessionDataResult.rowCount ?? 0,
    tokenCount: tokenResult.rowCount ?? 0
  };
}
