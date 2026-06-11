import { readAgentRuntimeSettings, type NDXAgentRuntimeSettings } from "../runtime-settings/index.js";
import { serverContainerUserHome, serverWorkspaceProjectPath } from "../../common/server-path/index.js";
import type { NDXDatabase, NDXSessionDataRow } from "./types.js";

export const NDX_SESSION_SEARCH_EMBEDDING_DIMENSIONS = 4096;
export const NDX_SESSION_SEARCH_HNSW_DIMENSIONS = 256;

export type NDXSessionSearchRow = {
  dataid: string;
  sessionid: string;
  type: string;
  createdat: Date;
  text: string;
  tokenlength: number;
  similarity?: number | null;
  rank?: number | null;
  projectname?: string;
  path?: string;
  title?: string;
};

export type NDXSessionHistoryScope =
  | { type: "all" }
  | { type: "project"; projectname: string }
  | { type: "session"; sessionid: string };

export type NDXSessionHistorySearchInput = {
  scope: NDXSessionHistoryScope;
  query?: string;
  limit?: number;
  userHome?: string;
};

export type NDXSessionHistorySearchResult = {
  mode: "list" | "vector" | "fts";
  scope: NDXSessionHistoryScope;
  query?: string;
  embedding: {
    configured: boolean;
    used: boolean;
    provider?: string;
    model?: string;
    error?: string;
  };
  results: Array<{
    dataid: string;
    sessionid: string;
    projectname?: string;
    path?: string;
    title?: string;
    type: string;
    createdat: string;
    text: string;
    tokenlength: number;
    score?: {
      similarity?: number;
      rank?: number;
    };
  }>;
};

export async function recordSessionSearchFromSessionData(database: NDXDatabase, row: NDXSessionDataRow, userHome = serverContainerUserHome()): Promise<void> {
  const text = sessionSearchText(row);
  if (!text) {
    return;
  }
  await database.query(
    `
INSERT INTO sessionsearch (dataid, sessionid, type, createdat, "text")
VALUES ($1, $2::uuid, $3, $4, $5)
ON CONFLICT (dataid) DO UPDATE
SET
  sessionid = EXCLUDED.sessionid,
  type = EXCLUDED.type,
  createdat = EXCLUDED.createdat,
  "text" = EXCLUDED."text";
`,
    [row.dataid, row.sessionid, row.type, row.createdat, text]
  );

  void launchSessionSearchEmbedding(database, row.dataid, text, userHome).catch((error: unknown) => {
    database.logger?.warn("agent.server.session_search.embedding.failed", {
      dataid: String(row.dataid),
      error: error instanceof Error ? error.message : String(error)
    });
  });
}

export function sessionSearchText(row: Pick<NDXSessionDataRow, "type" | "contents">): string | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const contents = row.contents as { kind?: unknown; text?: unknown };
  if (row.type === "user" && contents.kind === "user_message" && typeof contents.text === "string" && contents.text.trim()) {
    return contents.text.trim();
  }
  if (row.type === "assistant" && contents.kind === "assistant_message" && typeof contents.text === "string" && contents.text.trim()) {
    return contents.text.trim();
  }
  return undefined;
}

export async function searchSessionHistory(database: NDXDatabase, input: NDXSessionHistorySearchInput): Promise<NDXSessionHistorySearchResult> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const userHome = input.userHome ?? serverContainerUserHome();
  const settings = await readAgentRuntimeSettings(userHome);
  const query = input.query?.trim();
  const embeddingStatus: NDXSessionHistorySearchResult["embedding"] = {
    configured: Boolean(settings.embeddings),
    used: false,
    ...(settings.embeddings ? { provider: settings.embeddings.provider, model: settings.embeddings.model } : {})
  };

  if (!query) {
    return {
      mode: "list",
      scope: input.scope,
      embedding: embeddingStatus,
      results: formatSessionHistoryRows(await selectSessionHistoryRows(database, input.scope, limit))
    };
  }

  const vector = settings.embeddings ? await embedSessionSearchText(settings.embeddings, query).catch((error: unknown) => {
    embeddingStatus.error = error instanceof Error ? error.message : String(error);
    return undefined;
  }) : undefined;
  if (vector) {
    embeddingStatus.used = true;
    return {
      mode: "vector",
      scope: input.scope,
      query,
      embedding: embeddingStatus,
      results: formatSessionHistoryRows(await selectSessionHistoryRows(database, input.scope, limit, query, vector))
    };
  }

  return {
    mode: "fts",
    scope: input.scope,
    query,
    embedding: embeddingStatus,
    results: formatSessionHistoryRows(await selectSessionHistoryRows(database, input.scope, limit, query))
  };
}

async function launchSessionSearchEmbedding(database: NDXDatabase, dataid: string, text: string, userHome: string): Promise<void> {
  const settings = await readAgentRuntimeSettings(userHome);
  if (!settings.embeddings) {
    return;
  }
  const vector = await embedSessionSearchText(settings.embeddings, text);
  await database.query(
    `
UPDATE sessionsearch
SET embedding = $2::vector(4096), hnsw = $3::vector(256)
WHERE dataid = $1;
`,
    [dataid, embeddingVectorLiteral(vector), hnswVectorLiteral(vector)]
  );
}

async function selectSessionHistoryRows(
  database: NDXDatabase,
  scope: NDXSessionHistoryScope,
  limit: number,
  query?: string,
  vector?: number[]
): Promise<NDXSessionSearchRow[]> {
  const values: unknown[] = [];
  const where: string[] = [];
  if (scope.type === "project") {
    values.push(scope.projectname);
    where.push(`s.projectname = $${values.length}`);
  }
  if (scope.type === "session") {
    values.push(scope.sessionid);
    where.push(`ss.sessionid = $${values.length}::uuid`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  if (!query) {
    values.push(limit);
    const result = await database.query<NDXSessionSearchRow>(
      `
SELECT ss.dataid::text AS dataid, ss.sessionid::text AS sessionid, ss.type, ss.createdat, ss."text" AS text, ss.tokenlength,
       s.projectname::text AS projectname, s.title
FROM sessionsearch ss
JOIN "session" s ON s.sessionid = ss.sessionid
${whereSql}
ORDER BY ss.createdat DESC, ss.dataid DESC
LIMIT $${values.length};
`,
      values
    );
    return result.rows;
  }

  values.push(query);
  const queryIndex = values.length;
  if (vector) {
    values.push(hnswVectorLiteral(vector));
    const vectorIndex = values.length;
    values.push(sessionSearchLexicalTerms(query));
    const lexicalTermsIndex = values.length;
    values.push(limit);
    const limitIndex = values.length;
    const result = await database.query<NDXSessionSearchRow>(
      `
WITH scoped AS (
  SELECT ss.*, s.projectname::text AS projectname, s.title
  FROM sessionsearch ss
  JOIN "session" s ON s.sessionid = ss.sessionid
  ${whereSql}
),
ranked AS (
	  SELECT dataid::text AS dataid, sessionid::text AS sessionid, type, createdat, "text" AS text, tokenlength, projectname, title,
         CASE
           WHEN hnsw = (array_fill(0::real, ARRAY[256])::vector(256)) THEN NULL
           ELSE 1 - (hnsw <=> $${vectorIndex}::vector(256))
         END AS similarity,
         ts_rank_cd(fts, websearch_to_tsquery(ndx_sessionsearch_regconfig(), $${queryIndex})) AS rank,
         CASE
           WHEN cardinality($${lexicalTermsIndex}::text[]) = 0 THEN 0::double precision
           ELSE (
             SELECT count(*)::double precision / cardinality($${lexicalTermsIndex}::text[])::double precision
             FROM unnest($${lexicalTermsIndex}::text[]) AS query_term(value)
             WHERE lower("text") LIKE '%' || query_term.value || '%'
           )
         END AS lexical_score
  FROM scoped
)
SELECT *
FROM ranked
WHERE COALESCE(similarity, 0) >= 0.15
   OR rank >= 0.05
   OR lexical_score >= 0.2
ORDER BY (COALESCE(similarity, 0) * 0.65 + LEAST(rank * 2, 0.25) + lexical_score * 0.35) DESC,
         COALESCE(similarity, -1) DESC, rank DESC, lexical_score DESC, createdat DESC, dataid DESC
LIMIT $${limitIndex};
`,
      values
    );
    return result.rows;
  }

  values.push(limit);
  const limitIndex = values.length;
  const result = await database.query<NDXSessionSearchRow>(
    `
WITH scoped AS (
	  SELECT ss.*, s.projectname::text AS projectname, s.title
  FROM sessionsearch ss
  JOIN "session" s ON s.sessionid = ss.sessionid
  ${whereSql}
),
ranked AS (
	  SELECT dataid::text AS dataid, sessionid::text AS sessionid, type, createdat, "text" AS text, tokenlength, projectname, title,
         ts_rank_cd(fts, websearch_to_tsquery(ndx_sessionsearch_regconfig(), $${queryIndex})) AS rank
  FROM scoped
)
SELECT *
FROM ranked
WHERE rank >= 0.05
ORDER BY rank DESC, createdat DESC, dataid DESC
LIMIT $${limitIndex};
`,
    values
  );
  return result.rows;
}

function formatSessionHistoryRows(rows: NDXSessionSearchRow[]): NDXSessionHistorySearchResult["results"] {
  return rows.map((row) => ({
    dataid: String(row.dataid),
    sessionid: String(row.sessionid),
    ...(row.projectname ? { projectname: row.projectname } : {}),
    ...(row.projectname ? { path: serverWorkspaceProjectPath(row.projectname) } : {}),
    ...(row.title ? { title: row.title } : {}),
    type: row.type,
    createdat: row.createdat instanceof Date ? row.createdat.toISOString() : String(row.createdat),
    text: row.text,
    tokenlength: Number(row.tokenlength ?? 0),
    ...((typeof row.similarity === "number" || typeof row.rank === "number") ? {
      score: {
        ...(typeof row.similarity === "number" ? { similarity: row.similarity } : {}),
        ...(typeof row.rank === "number" ? { rank: row.rank } : {})
      }
    } : {})
  }));
}

export async function embedSessionSearchText(settings: NonNullable<NDXAgentRuntimeSettings["embeddings"]>, text: string): Promise<number[]> {
  const endpoint = embeddingEndpoint(settings);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.token ? { Authorization: `Bearer ${settings.token}` } : {})
    },
    body: JSON.stringify({ model: settings.model, input: text })
  });
  if (!response.ok) {
    throw new Error(`embedding request failed: ${response.status}`);
  }
  const payload = await response.json() as { data?: Array<{ embedding?: unknown }>; embedding?: unknown };
  const raw = Array.isArray(payload.data) ? payload.data[0]?.embedding : payload.embedding;
  if (!Array.isArray(raw) || !raw.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("embedding response did not include a numeric vector.");
  }
  return padEmbeddingVector(raw);
}

function embeddingEndpoint(settings: NonNullable<NDXAgentRuntimeSettings["embeddings"]>): string {
  const base = settings.url?.trim()
    || process.env.NDX_EMBEDDINGS_URL?.trim()
    || (settings.provider === "openai" ? "https://api.openai.com/v1" : "http://127.0.0.1:11434/v1");
  const url = new URL(base);
  const pathname = url.pathname.replace(/\/$/, "");
  url.pathname = pathname.endsWith("/embeddings") ? pathname : `${pathname}/embeddings`;
  return url.toString();
}

function padEmbeddingVector(vector: number[]): number[] {
  const output = vector.slice(0, NDX_SESSION_SEARCH_EMBEDDING_DIMENSIONS);
  while (output.length < NDX_SESSION_SEARCH_EMBEDDING_DIMENSIONS) {
    output.push(0);
  }
  return output;
}

function padHnswVector(vector: number[]): number[] {
  const output = vector.slice(0, NDX_SESSION_SEARCH_HNSW_DIMENSIONS);
  while (output.length < NDX_SESSION_SEARCH_HNSW_DIMENSIONS) {
    output.push(0);
  }
  return output;
}

function hnswVectorLiteral(vector: number[]): string {
  return `[${padHnswVector(vector).map((value) => Number.isFinite(value) ? String(value) : "0").join(",")}]`;
}

function embeddingVectorLiteral(vector: number[]): string {
  return `[${padEmbeddingVector(vector).map((value) => Number.isFinite(value) ? String(value) : "0").join(",")}]`;
}

function sessionSearchLexicalTerms(query: string): string[] {
  return [...new Set((query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])
    .map((term) => term.replace(/^-+|-+$/g, ""))
    .filter((term) => term.length >= 2))]
    .slice(0, 24);
}
