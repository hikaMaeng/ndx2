import type { QueryResult, QueryResultRow } from "pg";
import type { NDXSessionRow } from "../../../agent/session/index.js";
import { withSessionProjectPath } from "../../../agent/session/index.js";

export type NDXWebSessionFavoriteDatabase = {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
};

export type NDXWebSessionFavoriteRow = NDXSessionRow & {
  pinnedat: Date;
};

export const WEB_SESSION_FAVORITE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS web_session_favorite (
  sessionid uuid PRIMARY KEY REFERENCES "session" (sessionid) ON DELETE CASCADE,
  pinnedat timestamptz NOT NULL DEFAULT now()
);
`;

export const WEB_SESSION_FAVORITE_TABLE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS web_session_favorite_pinnedat_idx ON web_session_favorite (pinnedat DESC, sessionid DESC);
`;

const WEB_SESSION_FAVORITE_SELECT_FROM_SQL = `
SELECT s.sessionid, s.title, s.lastupdated, s.mode, s.projectname, s.parentsessionid, s.rootsessionid, s.createdbytoolcallid, s.createdbytoolname, s.subagenttype, s.subagentconfig, s.subagentstatus, s.model, s.isrunning, s.turnphase, s.interruptrequested, s.interruptrequestedat, s.interruptcompletedat, s.runtimedata, f.pinnedat
FROM web_session_favorite f
JOIN "session" s ON s.sessionid = f.sessionid
`;

export async function initWebSessionFavoriteDatabase(database: NDXWebSessionFavoriteDatabase): Promise<void> {
  await database.query(WEB_SESSION_FAVORITE_TABLE_SQL);
  await database.query(WEB_SESSION_FAVORITE_TABLE_INDEX_SQL);
}

export async function listWebSessionFavorite(database: NDXWebSessionFavoriteDatabase): Promise<NDXWebSessionFavoriteRow[]> {
  const result = await database.query<NDXWebSessionFavoriteRow>(`
${WEB_SESSION_FAVORITE_SELECT_FROM_SQL}
WHERE s.parentsessionid = s.sessionid
ORDER BY f.pinnedat DESC, f.sessionid DESC;
`);

  return result.rows.map(withSessionProjectPath);
}

export async function upsertWebSessionFavorite(database: NDXWebSessionFavoriteDatabase, sessionid: string): Promise<NDXWebSessionFavoriteRow | undefined> {
  const result = await database.query<NDXWebSessionFavoriteRow>(
    `
WITH pinned AS (
  INSERT INTO web_session_favorite (sessionid)
  SELECT sessionid
  FROM "session"
  WHERE sessionid = $1::uuid
    AND parentsessionid = sessionid
  ON CONFLICT (sessionid)
  DO UPDATE SET pinnedat = now()
  RETURNING sessionid
)
${WEB_SESSION_FAVORITE_SELECT_FROM_SQL}
JOIN pinned p ON p.sessionid = f.sessionid
WHERE s.parentsessionid = s.sessionid;
`,
    [sessionid]
  );

  return result.rows[0] ? withSessionProjectPath(result.rows[0]) : undefined;
}

export async function deleteWebSessionFavorite(database: NDXWebSessionFavoriteDatabase, sessionid: string): Promise<boolean> {
  const result = await database.query(
    `
DELETE FROM web_session_favorite
WHERE sessionid = $1::uuid;
`,
    [sessionid]
  );

  return (result.rowCount ?? 0) > 0;
}
