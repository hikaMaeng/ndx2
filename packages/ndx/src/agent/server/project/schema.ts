import { normalizeWslPath } from "../../../common/file/index.js";
import { uuid7 } from "../../../common/uuid7/index.js";
import type { NDXDatabase } from "../init/database.js";
import type { NDXProjectInput, NDXProjectRow, NDXProjectTarget } from "./types.js";

export const PROJECT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS project (
  projectid uuid NOT NULL UNIQUE,
  target text NOT NULL DEFAULT 'local' CHECK (target IN ('local')),
  path text NOT NULL,
  title text NOT NULL DEFAULT '',
  PRIMARY KEY (target, path)
);
`;

export const PROJECT_TABLE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS project_projectid_idx ON project (projectid);
`;

export async function initProjectDatabase(database: NDXDatabase): Promise<void> {
  database.logger?.info("agent.server.project.schema.init.start");
  await database.query(PROJECT_TABLE_SQL);
  await database.query(PROJECT_TABLE_INDEX_SQL);
  database.logger?.info("agent.server.project.schema.init.complete");
}

export async function ensureProject(database: NDXDatabase, input: NDXProjectInput): Promise<NDXProjectRow> {
  const target = normalizeProjectTarget(input.target);
  const projectPath = normalizeWslPath(input.path).trim();
  const title = input.title?.trim() ?? "";
  if (!projectPath) {
    throw new Error("project path is required.");
  }

  const result = await database.query<NDXProjectRow>(
    `
WITH inserted AS (
  INSERT INTO project (projectid, target, path, title)
  VALUES ($1::uuid, $2, $3, $4)
  ON CONFLICT (target, path) DO NOTHING
  RETURNING projectid::text AS projectid, target, path, title
)
SELECT projectid, target, path, title FROM inserted
UNION ALL
SELECT projectid::text AS projectid, target, path, title
FROM project
WHERE target = $2
  AND path = $3
LIMIT 1;
`,
    [uuid7(), target, projectPath, title]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`project not found or created: ${target}:${projectPath}`);
  }

  return row;
}

export async function getProjectById(database: NDXDatabase, projectid: string): Promise<NDXProjectRow | undefined> {
  const result = await database.query<NDXProjectRow>(
    `
SELECT projectid::text AS projectid, target, path, title
FROM project
WHERE projectid = $1::uuid;
`,
    [projectid]
  );
  return result.rows[0];
}

export function normalizeProjectTarget(target: string | undefined): NDXProjectTarget {
  const normalized = target?.trim() || "local";
  if (normalized !== "local") {
    throw new Error("project target must be local.");
  }
  return normalized;
}
