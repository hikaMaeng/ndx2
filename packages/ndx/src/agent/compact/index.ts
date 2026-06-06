import { requestModelResponse, type ResponseInputItem } from "ndx/common/responseapi";
import { appendSessionData } from "../session/appendSessionData.js";
import { sessionDataText } from "../session/content.js";
import { listSessionData } from "../session/listSessionData.js";
import type { NDXDatabase, NDXModelConfig, NDXSessionDataRow, NDXSessionRow } from "../session/types.js";
import { estimateContextTokens } from "../contextusage/index.js";

export const NDX_COMPACT_CONTENT_KIND = "compact" as const;

export type NDXCompactContents = {
  kind: typeof NDX_COMPACT_CONTENT_KIND;
  text: string;
  previousCompactDataId?: string;
  sourceStartDataId?: string;
  sourceEndDataId?: string;
  sourceRowCount: number;
  createdReason: string;
};

export type NDXCompactReport = {
  phase: "turn_start" | "iteration";
  reason: string;
  tokens: number;
  contextsize: number;
  percent: number;
  remainingTokens: number;
  requiredTokens: number;
  averageTurnTokens: number;
  outputReserveTokens: number;
};

export type NDXTurnContextUsageStats = {
  turncount: number;
  tokens: number;
  avgtokens: number;
};

export type NDXCompactSessionHistoryOptions = {
  contextRows?: NDXSessionDataRow[];
};

export async function initCompactDatabase(database: NDXDatabase): Promise<void> {
  await database.query(`
CREATE TABLE IF NOT EXISTS turncontextusage (
  turncount bigint NOT NULL DEFAULT 0,
  tokens bigint NOT NULL DEFAULT 0,
  avgtokens bigint NOT NULL DEFAULT 0
);
`);
  await database.query("CREATE UNIQUE INDEX IF NOT EXISTS turncontextusage_singleton_idx ON turncontextusage ((true));");
  await database.query(`
INSERT INTO turncontextusage (turncount, tokens, avgtokens)
SELECT turncount, tokens, CASE WHEN turncount > 0 THEN CEIL(tokens::numeric / turncount)::bigint ELSE 0 END
FROM (
  SELECT COUNT(*)::bigint AS turncount, COALESCE(SUM(turn_tokens), 0)::bigint AS tokens
  FROM (
    SELECT input.dataid, COALESCE(SUM(CEIL(OCTET_LENGTH(row.contents::text)::numeric / 4)), 0)::bigint AS turn_tokens
    FROM sessiondata input
    LEFT JOIN LATERAL (
      SELECT MIN(next_input.dataid) AS next_dataid
      FROM sessiondata next_input
      WHERE next_input.sessionid = input.sessionid
        AND next_input.type = 'user'
        AND next_input.dataid > input.dataid
    ) next_user ON true
    JOIN sessiondata row ON row.sessionid = input.sessionid
      AND row.dataid >= input.dataid
      AND (next_user.next_dataid IS NULL OR row.dataid < next_user.next_dataid)
    WHERE input.type = 'user'
    GROUP BY input.dataid
  ) turns
) seed
WHERE NOT EXISTS (SELECT 1 FROM turncontextusage);
`);
}

export async function readTurnContextUsageStats(database: NDXDatabase): Promise<NDXTurnContextUsageStats> {
  const result = await database.query<{ turncount: string; tokens: string; avgtokens: string }>(`
SELECT turncount::text AS turncount, tokens::text AS tokens, avgtokens::text AS avgtokens
FROM turncontextusage
LIMIT 1;
`);
  const row = result.rows[0];
  return row
    ? { turncount: Number(row.turncount), tokens: Number(row.tokens), avgtokens: Number(row.avgtokens) }
    : { turncount: 0, tokens: 0, avgtokens: 0 };
}

export async function listSessionDataForModelContext(database: NDXDatabase, sessionid: string): Promise<NDXSessionDataRow[]> {
  return sessionDataRowsForModelContext(await listSessionData(database, sessionid));
}

export function sessionDataRowsFromLatestCompact(rows: NDXSessionDataRow[]): NDXSessionDataRow[] {
  const index = findLastCompactIndex(rows);
  return index >= 0 ? rows.slice(index) : rows;
}

export function sessionDataRowsForModelContext(rows: NDXSessionDataRow[]): NDXSessionDataRow[] {
  return sessionDataRowsFromLatestCompact(rows);
}

export function compactContents(input: Omit<NDXCompactContents, "kind">): NDXCompactContents {
  return { kind: NDX_COMPACT_CONTENT_KIND, ...input };
}

export async function compactSessionHistory(
  database: NDXDatabase,
  session: NDXSessionRow,
  report: NDXCompactReport,
  model: NDXModelConfig = session.model,
  options: NDXCompactSessionHistoryOptions = {}
): Promise<{ row: NDXSessionDataRow; text: string; sourceRows: NDXSessionDataRow[]; previousCompact?: NDXSessionDataRow }> {
  const rows = await listSessionData(database, session.sessionid);
  const lastCompactIndex = findLastCompactIndex(rows);
  const previousCompact = lastCompactIndex >= 0 ? rows[lastCompactIndex] : undefined;
  const contextRows = options.contextRows ?? sessionDataRowsForModelContext(rows);
  const previousCompactDataId = previousCompact ? String(previousCompact.dataid) : undefined;
  const sourceRows = previousCompactDataId
    ? contextRows.filter((row) => String(row.dataid) !== previousCompactDataId)
    : contextRows;
  const text = await summarizeCompactHistory(model, previousCompact, sourceRows);
  const row = await appendSessionData(database, session.sessionid, "compact", compactContents({
    text,
    previousCompactDataId: previousCompact ? String(previousCompact.dataid) : undefined,
    sourceStartDataId: sourceRows[0] ? String(sourceRows[0].dataid) : undefined,
    sourceEndDataId: sourceRows.at(-1) ? String(sourceRows.at(-1)?.dataid) : undefined,
    sourceRowCount: sourceRows.length,
    createdReason: report.reason
  }));
  return { row, text, sourceRows, previousCompact };
}

export async function recordTurnContextUsage(database: NDXDatabase, input: NDXSessionDataRow, assistant: NDXSessionDataRow): Promise<void> {
  const rows = await listSessionData(database, input.sessionid);
  const start = Number(input.dataid);
  const end = Number(assistant.dataid);
  const tokens = rows
    .filter((row) => {
      const dataid = Number(row.dataid);
      return Number.isFinite(dataid) && dataid >= start && dataid <= end;
    })
    .reduce((total, row) => total + estimateContextTokens(sessionDataText(row) ?? JSON.stringify(row.contents ?? "")), 0);
  await database.query(`
UPDATE turncontextusage
SET
  turncount = turncount + 1,
  tokens = tokens + $1,
  avgtokens = CEIL((tokens + $1)::numeric / (turncount + 1))::bigint;
`, [tokens]);
  await database.query(`
INSERT INTO turncontextusage (turncount, tokens, avgtokens)
SELECT 1, $1, $1
WHERE NOT EXISTS (SELECT 1 FROM turncontextusage);
`, [tokens]);
}

function findLastCompactIndex(rows: NDXSessionDataRow[]): number {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.type === "compact" || compactText(row) !== undefined) {
      return index;
    }
  }
  return -1;
}

async function summarizeCompactHistory(model: NDXModelConfig, previousCompact: NDXSessionDataRow | undefined, sourceRows: NDXSessionDataRow[]): Promise<string> {
  const previous = previousCompact ? compactText(previousCompact) : undefined;
  const transcript = compactTranscript(sourceRows, Math.max(4096, Math.floor(model.contextsize * 0.55)));
  if (!previous && !transcript.trim()) {
    return "No prior conversation content was available for compaction.";
  }
  const messages: ResponseInputItem[] = [
    {
      role: "system",
      content: [
        "You compact an agent session history into a durable summary.",
        "Preserve user goals, constraints, decisions, completed work, unresolved work, file paths, commands, errors, and final answers.",
        "Use concise Korean unless the source text is clearly in another language.",
        "Return only the compacted summary text."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        previous ? `<previous_compact>\n${previous}\n</previous_compact>` : "",
        `<session_turns>\n${transcript}\n</session_turns>`
      ].filter(Boolean).join("\n\n")
    }
  ];
  try {
    const response = await requestModelResponse(model, messages, []);
    const text = response.content.trim();
    return text || fallbackCompactSummary(previous, transcript);
  } catch {
    return fallbackCompactSummary(previous, transcript);
  }
}

function compactTranscript(rows: NDXSessionDataRow[], maxTokens: number): string {
  const entries = rows.flatMap((row) => {
    const text = compactTurnText(row);
    return text ? [{ dataid: String(row.dataid), text }] : [];
  });
  const output: string[] = [];
  let tokens = 0;
  let omitted = 0;
  for (const entry of entries) {
    const nextTokens = estimateContextTokens(entry.text);
    if (tokens + nextTokens > maxTokens) {
      omitted += 1;
      continue;
    }
    output.push(`[dataid:${entry.dataid}]\n${entry.text}`);
    tokens += nextTokens;
  }
  return omitted > 0 ? `${output.join("\n\n")}\n\n[omitted ${omitted} older/larger entries that did not fit the compact prompt]` : output.join("\n\n");
}

function compactTurnText(row: NDXSessionDataRow): string | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const contents = row.contents as { kind?: unknown; text?: unknown; message?: unknown };
  if (contents.kind === "tool_generated_user_message" && Array.isArray((contents as { sources?: unknown }).sources)) {
    const sources = (contents as { sources: unknown[] }).sources;
    if (sources.some((source) => source && typeof source === "object" && (source as { tool?: unknown }).tool === "reasoning_effort")) {
      return undefined;
    }
  }
  if ((contents.kind === "user_message" || contents.kind === "tool_generated_user_message") && typeof contents.text === "string" && contents.text.trim()) {
    return `User request:\n${contents.text.trim()}`;
  }
  if (contents.kind === "assistant_message" && typeof contents.text === "string" && contents.text.trim()) {
    return `Final assistant response:\n${contents.text.trim()}`;
  }
  if (contents.kind === "error" && typeof contents.message === "string" && contents.message.trim()) {
    return `Final assistant error:\n${contents.message.trim()}`;
  }
  return undefined;
}

function compactText(row: NDXSessionDataRow | undefined): string | undefined {
  if (!row?.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const contents = row.contents as { kind?: unknown; text?: unknown };
  return contents.kind === NDX_COMPACT_CONTENT_KIND && typeof contents.text === "string" ? contents.text : undefined;
}

function fallbackCompactSummary(previous: string | undefined, transcript: string): string {
  return [
    previous ? `Previous compact summary:\n${previous}` : "",
    transcript ? `Recent session transcript summary source:\n${transcript}` : ""
  ].filter(Boolean).join("\n\n").slice(0, 48_000);
}
