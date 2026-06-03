import type { QueryResult, QueryResultRow } from "pg";
import { isNDXClientId } from "../../../common/protocol/identity/clientIdentity.js";
import { DEFAULT_NDX_WEB_CLIENT_USERID, normalizeWebClientState } from "./state.js";
import type { NDXWebClientStateInput, NDXWebClientStateRow, NDXWebProjectInput, NDXWebProjectRow } from "./types.js";

export type NDXWebClientStateDatabase = {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
};

type WebClientStateDatabaseRow = {
  clientid: string;
  userid: string | null;
  state: unknown;
  updatedat: Date;
};

export const WEB_CLIENT_STATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS webclientstate (
  clientid uuid PRIMARY KEY,
  userid text REFERENCES users (userid) ON DELETE SET NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(state) = 'object'),
  updatedat timestamptz NOT NULL DEFAULT now()
);
`;

export const WEB_CLIENT_STATE_TABLE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS webclientstate_userid_updatedat_idx ON webclientstate (userid, updatedat DESC);
`;

export const WEB_PROJECT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS web_project (
  projectname text PRIMARY KEY,
  screenorder integer NOT NULL DEFAULT 0 CHECK (screenorder >= 0),
  userid text NOT NULL REFERENCES users (userid) ON DELETE RESTRICT,
  updatedat timestamptz NOT NULL DEFAULT now()
);
`;

export const WEB_PROJECT_TABLE_MIGRATION_SQL = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'web_project'
      AND column_name = 'projectid'
  ) THEN
    DROP TABLE web_project;
  END IF;
END $$;
DROP INDEX IF EXISTS web_project_target_screenorder_idx;
DROP INDEX IF EXISTS web_project_userid_projectid_idx;
DROP INDEX IF EXISTS web_project_screenorder_idx;
`;

export const WEB_PROJECT_TABLE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS web_project_screenorder_idx ON web_project (screenorder DESC, projectname);
CREATE INDEX IF NOT EXISTS web_project_userid_projectname_idx ON web_project (userid, projectname);
`;

export async function initWebClientStateDatabase(database: NDXWebClientStateDatabase): Promise<void> {
  await database.query(WEB_CLIENT_STATE_TABLE_SQL);
  await database.query(WEB_CLIENT_STATE_TABLE_INDEX_SQL);
  await database.query(WEB_PROJECT_TABLE_MIGRATION_SQL);
  await database.query(WEB_PROJECT_TABLE_SQL);
  await database.query(WEB_PROJECT_TABLE_INDEX_SQL);
}

export async function getWebClientState(
  database: NDXWebClientStateDatabase,
  clientid: string
): Promise<NDXWebClientStateRow | undefined> {
  if (!isNDXClientId(clientid)) {
    throw new Error("clientid must be a uuid.");
  }

  const result = await database.query<WebClientStateDatabaseRow>(
    `
SELECT clientid, userid, state, updatedat
FROM webclientstate
WHERE clientid = $1
`,
    [clientid]
  );
  const row = result.rows[0];
  if (!row) {
    return undefined;
  }

  return {
    clientid: row.clientid,
    userid: row.userid,
    state: normalizeWebClientState(row.state),
    updatedat: row.updatedat
  };
}

export async function listWebProject(database: NDXWebClientStateDatabase): Promise<NDXWebProjectRow[]> {
  const result = await database.query<NDXWebProjectRow>(`
SELECT projectname, screenorder, userid, updatedat
FROM web_project
ORDER BY screenorder DESC, projectname ASC;
`);

  return result.rows;
}

export async function upsertWebProject(
  database: NDXWebClientStateDatabase,
  input: NDXWebProjectInput
): Promise<NDXWebProjectRow> {
  const projectname = input.projectname.trim();
  const userid = input.userid?.trim() || DEFAULT_NDX_WEB_CLIENT_USERID;
  if (!projectname || !userid) {
    throw new Error("projectname and userid are required.");
  }

  const result = await database.query<NDXWebProjectRow>(
    `
WITH updated AS (
  INSERT INTO web_project (projectname, screenorder, userid)
  VALUES ($1, COALESCE($2::integer, (SELECT COALESCE(MAX(screenorder), -1) + 1 FROM web_project)), $3)
ON CONFLICT (projectname)
  DO UPDATE SET screenorder = EXCLUDED.screenorder, userid = EXCLUDED.userid, updatedat = now()
  RETURNING projectname, screenorder, userid, updatedat
)
SELECT projectname, screenorder, userid, updatedat
FROM updated;
`,
    [projectname, input.screenorder ?? null, userid]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("web_project upsert returned no row.");
  }

  return row;
}

export async function updateWebProjectUser(
  database: NDXWebClientStateDatabase,
  projectname: string,
  userid: string
): Promise<NDXWebProjectRow> {
  const result = await database.query<NDXWebProjectRow>(
    `
WITH updated AS (
  UPDATE web_project
SET userid = $2, updatedat = now()
WHERE projectname = $1
  RETURNING projectname, screenorder, userid, updatedat
)
SELECT projectname, screenorder, userid, updatedat
FROM updated;
`,
    [projectname, userid]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`web_project not found: ${projectname}`);
  }

  return row;
}

export async function deleteWebProject(database: NDXWebClientStateDatabase, projectname: string): Promise<NDXWebProjectRow> {
  const result = await database.query<NDXWebProjectRow>(
    `
DELETE FROM web_project
WHERE projectname = $1
RETURNING projectname, screenorder, userid, updatedat;
`,
    [projectname]
  );
  const project = result.rows[0] ?? { projectname, screenorder: 0, userid: DEFAULT_NDX_WEB_CLIENT_USERID, updatedat: new Date() };
  await database.query(
    `
UPDATE webclientstate
SET state = jsonb_set(
  CASE
    WHEN state #>> '{lastSession,projectName}' = $1::text THEN
      (
        CASE
          WHEN state->>'activeProjectName' = $1::text THEN state - 'activeProjectName'
          ELSE state
        END
      ) - 'lastSession'
    WHEN state->>'activeProjectName' = $1::text THEN state - 'activeProjectName'
    ELSE state
  END,
  '{projects}',
  COALESCE(
    (
      SELECT jsonb_agg(project)
      FROM jsonb_array_elements(COALESCE(state->'projects', '[]'::jsonb)) AS project
      WHERE project->>'projectName' <> $1::text
    ),
    '[]'::jsonb
  ),
  true
),
updatedat = now()
WHERE state->'projects' @> jsonb_build_array(jsonb_build_object('projectName', $1::text))
  OR state->>'activeProjectName' = $1::text
  OR state #>> '{lastSession,projectName}' = $1::text;
`,
    [projectname]
  );
  return project;
}

export async function upsertWebClientState(
  database: NDXWebClientStateDatabase,
  input: NDXWebClientStateInput
): Promise<NDXWebClientStateRow> {
  if (!isNDXClientId(input.clientid)) {
    throw new Error("clientid must be a uuid.");
  }

  const state = normalizeWebClientState(input.state);
  const userid = input.userid ?? state.selectedUserid ?? null;
  const result = await database.query<WebClientStateDatabaseRow>(
    `
INSERT INTO webclientstate (clientid, userid, state)
VALUES ($1, $2, $3::jsonb)
ON CONFLICT (clientid)
DO UPDATE SET userid = EXCLUDED.userid, state = EXCLUDED.state, updatedat = now()
RETURNING clientid, userid, state, updatedat
`,
    [input.clientid, userid, JSON.stringify(state)]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("web client state upsert returned no row.");
  }

  return {
    clientid: row.clientid,
    userid: row.userid,
    state: normalizeWebClientState(row.state),
    updatedat: row.updatedat
  };
}
