import type { NDXDatabase } from "../init/database.js";
import type {
  NDXSelfcheckCandidateRow,
  NDXSelfcheckCursorRow,
  NDXSelfcheckListInput,
  NDXSelfcheckRow,
  NDXSelfcheckRunRow,
  NDXSelfcheckStatus
} from "./types.js";

export async function listSelfcheck(database: NDXDatabase, input: NDXSelfcheckListInput = {}): Promise<NDXSelfcheckRow[]> {
  const values: unknown[] = [];
  const filters: string[] = [];
  if (input.status) {
    values.push(input.status);
    filters.push(`status = $${values.length}`);
  }
  if (input.subjectkind) {
    values.push(input.subjectkind);
    filters.push(`subjectkind = $${values.length}`);
  }
  if (input.subjectname) {
    values.push(input.subjectname);
    filters.push(`subjectname = $${values.length}`);
  }
  values.push(Math.min(Math.max(input.limit ?? 100, 1), 500));
  const result = await database.query<NDXSelfcheckRow>(
    `
SELECT *
FROM selfcheck
${filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""}
ORDER BY updatedat DESC, createdat DESC
LIMIT $${values.length};
`,
    values
  );
  return result.rows;
}

export async function getSelfcheck(database: NDXDatabase, selfcheckid: string): Promise<NDXSelfcheckRow | undefined> {
  const result = await database.query<NDXSelfcheckRow>(`SELECT * FROM selfcheck WHERE selfcheckid = $1;`, [selfcheckid]);
  return result.rows[0];
}

export async function updateSelfcheckStatus(
  database: NDXDatabase,
  selfcheckid: string,
  status: NDXSelfcheckStatus
): Promise<NDXSelfcheckRow> {
  const result = await database.query<NDXSelfcheckRow>(
    `
UPDATE selfcheck
SET status = $2, updatedat = now()
WHERE selfcheckid = $1
RETURNING *;
`,
    [selfcheckid, status]
  );
  if (!result.rows[0]) {
    throw new Error(`selfcheck not found: ${selfcheckid}`);
  }
  return result.rows[0];
}

export async function listSelfcheckCandidates(database: NDXDatabase, limit = 100): Promise<NDXSelfcheckCandidateRow[]> {
  const result = await database.query<NDXSelfcheckCandidateRow>(
    `
SELECT *
FROM selfcheck_analysis_candidate
ORDER BY createdat DESC
LIMIT $1;
`,
    [Math.min(Math.max(limit, 1), 500)]
  );
  return result.rows;
}

export async function listSelfcheckCursors(database: NDXDatabase): Promise<NDXSelfcheckCursorRow[]> {
  const result = await database.query<NDXSelfcheckCursorRow>(
    `
SELECT *
FROM selfcheck_analysis_cursor
ORDER BY subjectkind, subjectname, analyzer;
`
  );
  return result.rows;
}

export async function listSelfcheckRuns(database: NDXDatabase, limit = 50): Promise<NDXSelfcheckRunRow[]> {
  const result = await database.query<NDXSelfcheckRunRow>(
    `
SELECT *
FROM selfcheck_analysis_run
ORDER BY startedat DESC
LIMIT $1;
`,
    [Math.min(Math.max(limit, 1), 200)]
  );
  return result.rows;
}
