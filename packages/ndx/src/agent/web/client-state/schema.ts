import type { QueryResult, QueryResultRow } from "pg";
import { isNDXClientId } from "../../common/protocol/identity/clientIdentity.js";
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
  projectid uuid PRIMARY KEY REFERENCES project (projectid) ON DELETE CASCADE,
  screenorder integer NOT NULL DEFAULT 0 CHECK (screenorder >= 0),
  userid text NOT NULL REFERENCES users (userid) ON DELETE RESTRICT,
  isactive boolean NOT NULL DEFAULT true,
  updatedat timestamptz NOT NULL DEFAULT now()
);
`;

export const WEB_PROJECT_TABLE_MIGRATION_SQL = `
ALTER TABLE web_project ADD COLUMN IF NOT EXISTS isactive boolean NOT NULL DEFAULT true;
UPDATE web_project SET isactive = true WHERE isactive IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'web_project'
      AND column_name = 'path'
  ) THEN
    WITH ranked AS (
      SELECT
        projectid::text AS oldprojectid,
        target,
        path,
        ROW_NUMBER() OVER (PARTITION BY target, path ORDER BY isactive DESC, screenorder DESC, updatedat DESC, projectid::text ASC) AS rownumber
      FROM web_project
    )
    INSERT INTO project (projectid, target, path, title)
    SELECT oldprojectid::uuid, target, path, ''
    FROM ranked
    WHERE rownumber = 1
    ON CONFLICT (target, path) DO NOTHING;

    WITH ranked AS (
      SELECT
        web_project.projectid::text AS oldprojectid,
        project.projectid::text AS newprojectid,
        project.target,
        project.path,
        web_project.screenorder,
        web_project.userid,
        web_project.isactive,
        web_project.updatedat,
        ROW_NUMBER() OVER (PARTITION BY web_project.target, web_project.path ORDER BY web_project.isactive DESC, web_project.screenorder DESC, web_project.updatedat DESC, web_project.projectid::text ASC) AS rownumber
      FROM web_project
      INNER JOIN project
        ON project.target = web_project.target
       AND project.path = web_project.path
    )
    INSERT INTO web_project (projectid, path, target, screenorder, userid, isactive, updatedat)
    SELECT newprojectid::uuid, path, target, screenorder, userid, isactive, updatedat
    FROM ranked
    WHERE rownumber = 1
    ON CONFLICT (projectid)
    DO UPDATE SET
      screenorder = EXCLUDED.screenorder,
      userid = EXCLUDED.userid,
      isactive = EXCLUDED.isactive,
      updatedat = EXCLUDED.updatedat;

    WITH ranked AS (
      SELECT
        web_project.projectid::text AS oldprojectid,
        project.projectid::text AS newprojectid,
        ROW_NUMBER() OVER (PARTITION BY web_project.target, web_project.path ORDER BY web_project.isactive DESC, web_project.screenorder DESC, web_project.updatedat DESC, web_project.projectid::text ASC) AS rownumber
      FROM web_project
      INNER JOIN project
        ON project.target = web_project.target
       AND project.path = web_project.path
    )
    UPDATE webclientstate
    SET state = replace(state::text, oldprojectid, newprojectid)::jsonb,
        updatedat = now()
    FROM ranked
    WHERE oldprojectid <> newprojectid
      AND rownumber = 1
      AND state::text LIKE '%' || oldprojectid || '%';

    WITH ranked AS (
      SELECT
        projectid,
        ROW_NUMBER() OVER (PARTITION BY target, path ORDER BY isactive DESC, screenorder DESC, updatedat DESC, projectid::text ASC) AS rownumber
      FROM web_project
    )
    DELETE FROM web_project
    USING ranked
    WHERE web_project.projectid = ranked.projectid
      AND ranked.rownumber > 1;

    WITH project_identity AS (
      SELECT
        web_project.projectid::text AS oldprojectid,
        project.projectid::text AS newprojectid
      FROM web_project
      INNER JOIN project
        ON project.target = web_project.target
       AND project.path = web_project.path
    )
    DELETE FROM web_project
    USING project_identity
    WHERE web_project.projectid::text = project_identity.oldprojectid
      AND project_identity.oldprojectid <> project_identity.newprojectid;
  END IF;
END $$;
DROP INDEX IF EXISTS web_project_target_screenorder_idx;
ALTER TABLE web_project ALTER COLUMN projectid TYPE uuid USING projectid::uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'web_project_projectid_fkey'
  ) THEN
    ALTER TABLE web_project
      ADD CONSTRAINT web_project_projectid_fkey
      FOREIGN KEY (projectid) REFERENCES project (projectid) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE web_project DROP COLUMN IF EXISTS path;
ALTER TABLE web_project DROP COLUMN IF EXISTS target;
`;

export const WEB_PROJECT_TABLE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS web_project_screenorder_idx ON web_project (isactive, screenorder DESC, projectid);
CREATE INDEX IF NOT EXISTS web_project_userid_projectid_idx ON web_project (userid, projectid);
`;

export async function initWebClientStateDatabase(database: NDXWebClientStateDatabase): Promise<void> {
  await database.query(WEB_CLIENT_STATE_TABLE_SQL);
  await database.query(WEB_CLIENT_STATE_TABLE_INDEX_SQL);
  await database.query(WEB_PROJECT_TABLE_SQL);
  await database.query(WEB_PROJECT_TABLE_MIGRATION_SQL);
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
SELECT project.projectid::text AS projectid, project.path, project.target, web_project.screenorder, web_project.userid, web_project.isactive, web_project.updatedat
FROM web_project
INNER JOIN project
  ON project.projectid = web_project.projectid
WHERE web_project.isactive = true
ORDER BY web_project.screenorder DESC, project.projectid ASC;
`);

  return result.rows;
}

export async function upsertWebProject(
  database: NDXWebClientStateDatabase,
  input: NDXWebProjectInput
): Promise<NDXWebProjectRow> {
  const projectid = input.projectid.trim();
  const userid = input.userid?.trim() || DEFAULT_NDX_WEB_CLIENT_USERID;
  const isactive = typeof input.isactive === "boolean" ? input.isactive : true;
  if (!projectid || !userid) {
    throw new Error("projectid and userid are required.");
  }

  const result = await database.query<NDXWebProjectRow>(
    `
WITH updated AS (
  INSERT INTO web_project (projectid, screenorder, userid, isactive)
  VALUES ($1::uuid, COALESCE($2::integer, (SELECT COALESCE(MAX(screenorder), -1) + 1 FROM web_project)), $3, $4)
ON CONFLICT (projectid)
  DO UPDATE SET screenorder = EXCLUDED.screenorder, userid = EXCLUDED.userid, isactive = EXCLUDED.isactive, updatedat = now()
  RETURNING projectid, screenorder, userid, isactive, updatedat
)
SELECT project.projectid::text AS projectid, project.path, project.target, updated.screenorder, updated.userid, updated.isactive, updated.updatedat
FROM updated
INNER JOIN project
  ON project.projectid = updated.projectid;
`,
    [projectid, input.screenorder ?? null, userid, isactive]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("web_project upsert returned no row.");
  }

  return row;
}

export async function updateWebProjectUser(
  database: NDXWebClientStateDatabase,
  projectid: string,
  userid: string
): Promise<NDXWebProjectRow> {
  const result = await database.query<NDXWebProjectRow>(
    `
WITH updated AS (
  UPDATE web_project
SET userid = $2, updatedat = now()
WHERE projectid = $1::uuid
  RETURNING projectid, screenorder, userid, isactive, updatedat
)
SELECT project.projectid::text AS projectid, project.path, project.target, updated.screenorder, updated.userid, updated.isactive, updated.updatedat
FROM updated
INNER JOIN project
  ON project.projectid = updated.projectid;
`,
    [projectid, userid]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`web_project not found: ${projectid}`);
  }

  return row;
}

export async function updateWebProjectActive(
  database: NDXWebClientStateDatabase,
  projectid: string,
  isactive: boolean
): Promise<NDXWebProjectRow> {
  const result = await database.query<NDXWebProjectRow>(
    `
WITH updated AS (
  UPDATE web_project
SET isactive = $2, updatedat = now()
WHERE projectid = $1::uuid
  RETURNING projectid, screenorder, userid, isactive, updatedat
)
SELECT project.projectid::text AS projectid, project.path, project.target, updated.screenorder, updated.userid, updated.isactive, updated.updatedat
FROM updated
INNER JOIN project
  ON project.projectid = updated.projectid;
`,
    [projectid, isactive]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`web_project not found: ${projectid}`);
  }

  return row;
}

export async function deleteWebProject(database: NDXWebClientStateDatabase, projectid: string): Promise<NDXWebProjectRow> {
  const project = await updateWebProjectActive(database, projectid, false);
  await database.query(
    `
UPDATE webclientstate
SET state = jsonb_set(
  CASE
    WHEN state #>> '{lastSession,projectId}' = $1::text THEN
      (
        CASE
          WHEN state->>'activeProjectId' = $1::text THEN state - 'activeProjectId'
          ELSE state
        END
      ) - 'lastSession'
    WHEN state->>'activeProjectId' = $1::text THEN state - 'activeProjectId'
    ELSE state
  END,
  '{projects}',
  COALESCE(
    (
      SELECT jsonb_agg(project)
      FROM jsonb_array_elements(COALESCE(state->'projects', '[]'::jsonb)) AS project
      WHERE project->>'id' <> $1::text
    ),
    '[]'::jsonb
  ),
  true
),
updatedat = now()
WHERE state->'projects' @> jsonb_build_array(jsonb_build_object('id', $1::text))
  OR state->>'activeProjectId' = $1::text
  OR state #>> '{lastSession,projectId}' = $1::text;
`,
    [projectid]
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
