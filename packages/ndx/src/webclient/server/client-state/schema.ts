import type { QueryResult, QueryResultRow } from "pg";
import { isNDXClientId } from "../../../common/protocol/identity/clientIdentity.js";
import { normalizeWebClientState } from "./state.js";
import type { NDXWebClientStateInput, NDXWebClientStateRow, NDXWebProjectInput, NDXWebProjectRow } from "./types.js";

export type NDXWebClientStateDatabase = {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
};

type WebClientStateDatabaseRow = {
  clientid: string;
  state: unknown;
  updatedat: Date;
};

export const WEB_CLIENT_STATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS webclientstate (
  clientid uuid PRIMARY KEY,
  state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(state) = 'object'),
  updatedat timestamptz NOT NULL DEFAULT now()
);
`;

export const WEB_CLIENT_STATE_TABLE_INDEX_SQL = `
DROP INDEX IF EXISTS webclientstate_userid_updatedat_idx;
ALTER TABLE webclientstate DROP COLUMN IF EXISTS userid;
`;

export const WEB_PROJECT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS web_project (
  projectname text PRIMARY KEY,
  screenorder integer NOT NULL DEFAULT 0 CHECK (screenorder >= 0),
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
DROP INDEX IF EXISTS web_project_userid_projectname_idx;
ALTER TABLE IF EXISTS web_project DROP COLUMN IF EXISTS userid;
`;

export const WEB_PROJECT_TABLE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS web_project_screenorder_idx ON web_project (screenorder DESC, projectname);
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
SELECT clientid, state, updatedat
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
    state: normalizeWebClientState(row.state),
    updatedat: row.updatedat
  };
}

export async function listWebProject(database: NDXWebClientStateDatabase): Promise<NDXWebProjectRow[]> {
  const result = await database.query<NDXWebProjectRow>(`
SELECT projectname, screenorder, updatedat
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
  if (!projectname) {
    throw new Error("projectname is required.");
  }

  const result = await database.query<NDXWebProjectRow>(
    `
WITH updated AS (
  INSERT INTO web_project (projectname, screenorder)
  VALUES ($1, COALESCE($2::integer, (SELECT COALESCE(MAX(screenorder), -1) + 1 FROM web_project)))
ON CONFLICT (projectname)
  DO UPDATE SET screenorder = EXCLUDED.screenorder, updatedat = now()
  RETURNING projectname, screenorder, updatedat
)
SELECT projectname, screenorder, updatedat
FROM updated;
`,
    [projectname, input.screenorder ?? null]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("web_project upsert returned no row.");
  }

  return row;
}

export async function deleteWebProject(database: NDXWebClientStateDatabase, projectname: string): Promise<NDXWebProjectRow> {
  const result = await database.query<NDXWebProjectRow>(
    `
DELETE FROM web_project
WHERE projectname = $1
RETURNING projectname, screenorder, updatedat;
`,
    [projectname]
  );
  const project = result.rows[0] ?? { projectname, screenorder: 0, updatedat: new Date() };
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
  const result = await database.query<WebClientStateDatabaseRow>(
    `
INSERT INTO webclientstate (clientid, state)
VALUES ($1, $2::jsonb)
ON CONFLICT (clientid)
DO UPDATE SET state = EXCLUDED.state, updatedat = now()
RETURNING clientid, state, updatedat
`,
    [input.clientid, JSON.stringify(state)]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("web client state upsert returned no row.");
  }

  return {
    clientid: row.clientid,
    state: normalizeWebClientState(row.state),
    updatedat: row.updatedat
  };
}
