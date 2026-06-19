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
  fallbackReason?: string;
  previousCompactDataId?: string;
  sourceStartDataId?: string;
  sourceEndDataId?: string;
  sourceRowCount: number;
  createdReason: string;
  sourceInput?: { dataId: string; text: string };
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

export type NDXAppendCompactSessionHistoryOptions = {
  previousCompact?: NDXSessionDataRow;
  sourceInput?: { dataId: string; text: string };
  fallbackMode?: "append" | "throw";
};

export type NDXCompactReplayContents = {
  kind: "compact_replay";
  sourceStartDataId?: string;
  sourceEndDataId?: string;
  sourceRowCount: number;
  rows: Array<{ dataid: string; type: string; contents: Record<string, unknown> | string; createdat: string }>;
};

type NDXCompactTranscriptEntry = {
  startDataId: string;
  endDataId: string;
  text: string;
  compactText: string;
  important: boolean;
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

export function compactReplayContents(rows: NDXSessionDataRow[]): NDXCompactReplayContents {
  return {
    kind: "compact_replay",
    sourceStartDataId: rows[0] ? String(rows[0].dataid) : undefined,
    sourceEndDataId: rows.at(-1) ? String(rows.at(-1)?.dataid) : undefined,
    sourceRowCount: rows.length,
    rows: rows.map((row) => ({
      dataid: String(row.dataid),
      type: row.type,
      contents: replayContents(row.contents),
      createdat: row.createdat.toISOString()
    }))
  };
}

export async function compactSessionHistory(
  database: NDXDatabase,
  session: NDXSessionRow,
  report: NDXCompactReport,
  model: NDXModelConfig = session.model,
  options: NDXCompactSessionHistoryOptions = {}
): Promise<{ row: NDXSessionDataRow; text: string; sourceRows: NDXSessionDataRow[]; previousCompact?: NDXSessionDataRow; fallbackReason?: string }> {
  const rows = await listSessionData(database, session.sessionid);
  const lastCompactIndex = findLastCompactIndex(rows);
  const previousCompact = lastCompactIndex >= 0 ? rows[lastCompactIndex] : undefined;
  const contextRows = options.contextRows ?? sessionDataRowsForModelContext(rows);
  const previousCompactDataId = previousCompact ? String(previousCompact.dataid) : undefined;
  const sourceRows = previousCompactDataId
    ? contextRows.filter((row) => String(row.dataid) !== previousCompactDataId)
    : contextRows;
  return appendCompactSessionHistory(database, session, report, sourceRows, model, { previousCompact });
}

export async function appendCompactSessionHistory(
  database: NDXDatabase,
  session: NDXSessionRow,
  report: NDXCompactReport,
  sourceRows: NDXSessionDataRow[],
  model: NDXModelConfig = session.model,
  options: NDXAppendCompactSessionHistoryOptions = {}
): Promise<{ row: NDXSessionDataRow; text: string; sourceRows: NDXSessionDataRow[]; previousCompact?: NDXSessionDataRow; fallbackReason?: string }> {
  const previousCompact = options.previousCompact;
  const summary = await summarizeCompactHistory(model, previousCompact, sourceRows);
  if (summary.fallbackReason && options.fallbackMode === "throw") {
    throw new Error(`이전 히스토리 compact 생성에 실패했습니다: ${summary.fallbackReason}`);
  }
  const row = await appendSessionData(database, session.sessionid, "compact", compactContents({
    text: summary.text,
    ...(summary.fallbackReason ? { fallbackReason: summary.fallbackReason } : {}),
    previousCompactDataId: previousCompact ? String(previousCompact.dataid) : undefined,
    sourceStartDataId: sourceRows[0] ? String(sourceRows[0].dataid) : undefined,
    sourceEndDataId: sourceRows.at(-1) ? String(sourceRows.at(-1)?.dataid) : undefined,
    sourceRowCount: sourceRows.length,
    createdReason: report.reason,
    ...(options.sourceInput ? { sourceInput: options.sourceInput } : {})
  }));
  return { row, text: summary.text, sourceRows, previousCompact, fallbackReason: summary.fallbackReason };
}

export async function rebuildTurnContextUsage(database: NDXDatabase): Promise<void> {
  await database.query(`
WITH aggregate AS (
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
),
upsert AS (
  UPDATE turncontextusage
  SET
    turncount = aggregate.turncount,
    tokens = aggregate.tokens,
    avgtokens = CASE WHEN aggregate.turncount > 0 THEN CEIL(aggregate.tokens::numeric / aggregate.turncount)::bigint ELSE 0 END
  FROM aggregate
  RETURNING 1
)
INSERT INTO turncontextusage (turncount, tokens, avgtokens)
SELECT aggregate.turncount, aggregate.tokens, CASE WHEN aggregate.turncount > 0 THEN CEIL(aggregate.tokens::numeric / aggregate.turncount)::bigint ELSE 0 END
FROM aggregate
WHERE NOT EXISTS (SELECT 1 FROM upsert);
`);
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

function replayContents(contents: unknown): Record<string, unknown> | string {
  if (typeof contents === "string") {
    return contents;
  }
  if (contents && typeof contents === "object" && !Array.isArray(contents)) {
    return contents as Record<string, unknown>;
  }
  return String(contents ?? "");
}

async function summarizeCompactHistory(model: NDXModelConfig, previousCompact: NDXSessionDataRow | undefined, sourceRows: NDXSessionDataRow[]): Promise<{ text: string; fallbackReason?: string }> {
  const previous = previousCompact ? compactText(previousCompact) : undefined;
  const transcript = compactTranscript(sourceRows, Math.max(4096, Math.floor(model.contextsize * 0.55)));
  if (!previous && !transcript.trim()) {
    return { text: "No prior conversation content was available for compaction." };
  }
  const messages: ResponseInputItem[] = [
    {
      role: "system",
      content: [
        "You compact an agent session history into a durable recall index.",
        "The original rows remain in sessiondata. Do not try to make this summary self-contained when exact details can be recalled.",
        "Preserve dataid anchors exactly. Every item must include a [dataid:...] or [dataid:start-end] anchor.",
        "For any item whose omitted details may matter, tell the next model to use session_history with mode=recall and the anchor range.",
        "Spend more text on load-bearing turns: user constraints, decisions, file paths, commands, errors, failed tools, completed work, unresolved work, and final answers.",
        "Omit or compress trivial acknowledgements and no-op turns.",
        "Use concise Korean unless the source text is clearly in another language.",
        "Return only the compacted recall index text."
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
    return text
      ? { text }
      : { text: fallbackCompactSummary(previous, transcript), fallbackReason: "compact model returned an empty response" };
  } catch (error) {
    return {
      text: fallbackCompactSummary(previous, transcript),
      fallbackReason: error instanceof Error && error.message.trim() ? error.message : "compact model request failed"
    };
  }
}

function compactTranscript(rows: NDXSessionDataRow[], maxTokens: number): string {
  const entries = compactTranscriptEntries(rows);
  const output: string[] = [];
  let tokens = 0;
  let omitted = 0;
  for (const entry of entries) {
    const preferredText = entry.important ? entry.text : entry.compactText;
    const preferredTokens = estimateContextTokens(preferredText);
    if (tokens + preferredTokens <= maxTokens) {
      output.push(preferredText);
      tokens += preferredTokens;
      continue;
    }
    const compactTokens = estimateContextTokens(entry.compactText);
    if (preferredText !== entry.compactText && tokens + compactTokens <= maxTokens) {
      output.push(entry.compactText);
      tokens += compactTokens;
      continue;
    }
    omitted += 1;
  }
  return omitted > 0
    ? `${output.join("\n\n")}\n\n[omitted ${omitted} low-priority entries that did not fit the compact prompt; use session_history search if their anchors are needed]`
    : output.join("\n\n");
}

function compactTranscriptEntries(rows: NDXSessionDataRow[]): NDXCompactTranscriptEntry[] {
  const groups: NDXSessionDataRow[][] = [];
  let current: NDXSessionDataRow[] = [];
  for (const row of rows) {
    if (isCompactUserRow(row) && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups.map(compactTranscriptEntry).filter((entry): entry is NDXCompactTranscriptEntry => Boolean(entry));
}

function compactTranscriptEntry(rows: NDXSessionDataRow[]): NDXCompactTranscriptEntry | undefined {
  const startDataId = String(rows[0]?.dataid ?? "");
  const endDataId = String(rows.at(-1)?.dataid ?? startDataId);
  if (!startDataId) {
    return undefined;
  }
  const userRequests: string[] = [];
  const assistantResponses: string[] = [];
  const errors: string[] = [];
  const details: string[] = [];
  let hasFailedTool = false;
  let hasSkillContext = false;
  let toolDetailRows = 0;
  for (const row of rows) {
    if (!row.contents || typeof row.contents !== "object") {
      continue;
    }
    const contents = row.contents as {
      kind?: unknown;
      text?: unknown;
      message?: unknown;
      name?: unknown;
      path?: unknown;
      toolCalls?: unknown;
      results?: unknown;
      sources?: unknown;
    };
    if (contents.kind === "tool_generated_user_message" && Array.isArray(contents.sources)) {
      if (contents.sources.some((source) => source && typeof source === "object" && ((source as { tool?: unknown }).tool === "reasoning_effort" || (source as { tool?: unknown }).tool === "thinking_level"))) {
        continue;
      }
    }
    if ((contents.kind === "user_message" || contents.kind === "tool_generated_user_message") && typeof contents.text === "string" && contents.text.trim()) {
      userRequests.push(contents.text.trim());
      continue;
    }
    if (contents.kind === "assistant_message" && typeof contents.text === "string" && contents.text.trim()) {
      assistantResponses.push(contents.text.trim());
      continue;
    }
    if (contents.kind === "error" && typeof contents.message === "string" && contents.message.trim()) {
      errors.push(contents.message.trim());
      continue;
    }
    if (contents.kind === "skill_context") {
      hasSkillContext = true;
      details.push(`Skill context: ${String(contents.name ?? "unknown")}${typeof contents.path === "string" ? ` ${contents.path}` : ""}`);
      continue;
    }
    if (contents.kind === "tool_call" && Array.isArray(contents.toolCalls)) {
      toolDetailRows += 1;
      const names = contents.toolCalls.map((toolCall) => toolCall && typeof toolCall === "object" ? (toolCall as { name?: unknown }).name : undefined).filter((name): name is string => typeof name === "string" && name.length > 0);
      details.push(names.length > 0 ? `Tool calls: ${names.join(", ")}` : "Tool calls recorded");
      continue;
    }
    if (contents.kind === "tool_result" && Array.isArray(contents.results)) {
      toolDetailRows += 1;
      const failed = contents.results
        .filter((result) => result && typeof result === "object" && (result as { success?: unknown }).success === false)
        .map((result) => {
          const next = result as { tool?: unknown; toolCallId?: unknown };
          return `${String(next.tool ?? "tool")}${typeof next.toolCallId === "string" ? ` ${next.toolCallId}` : ""}`;
        });
      if (failed.length > 0) {
        hasFailedTool = true;
        details.push(`Failed tool results: ${failed.join(", ")}`);
      } else {
        details.push("Tool results recorded");
      }
      continue;
    }
    const text = sessionDataText(row);
    if (text?.trim()) {
      details.push(`${row.type}: ${truncateCompactLine(text.trim(), 320)}`);
    }
  }
  if (userRequests.length === 0 && assistantResponses.length === 0 && errors.length === 0 && details.length === 0) {
    return undefined;
  }
  const anchor = startDataId === endDataId ? startDataId : `${startDataId}-${endDataId}`;
  const recall = startDataId === endDataId
    ? `session_history {"mode":"recall","scope":"session","dataid":"${startDataId}"}`
    : `session_history {"mode":"recall","scope":"session","startDataId":"${startDataId}","endDataId":"${endDataId}"}`;
  const important = hasFailedTool
    || hasSkillContext
    || errors.length > 0
    || userRequests.concat(assistantResponses).some((text) => /\/|\\|\b[A-Z][A-Za-z0-9_]*\b|error|failed|fail|결정|오류|실패|파일|경로|테스트/.test(text));
  const compactText = [
    `[dataid:${anchor}] ${compactOneLine(userRequests[0] ?? details[0] ?? "Session event")} -> ${compactOneLine(errors[0] ?? assistantResponses.at(-1) ?? "details available by recall")}`,
    `Details: use ${recall}.`
  ].join("\n");
  const text = [
    `[dataid:${anchor}]`,
    `Recall: use ${recall} for exact original rows.`,
    userRequests.length > 0 ? `User request:\n${userRequests.map((item) => truncateCompactBlock(item)).join("\n---\n")}` : "",
    assistantResponses.length > 0 ? `Final assistant response:\n${assistantResponses.map((item) => truncateCompactBlock(item)).join("\n---\n")}` : "",
    errors.length > 0 ? `Final assistant error:\n${errors.map((item) => truncateCompactBlock(item)).join("\n---\n")}` : "",
    details.length > 0 ? `Detail signals:\n${details.slice(0, 8).map((item) => `- ${item}`).join("\n")}${toolDetailRows > 0 ? "\n- Tool detail rows are available by recall." : ""}` : ""
  ].filter(Boolean).join("\n");
  return { startDataId, endDataId, text, compactText, important };
}

function isCompactUserRow(row: NDXSessionDataRow): boolean {
  if (!row.contents || typeof row.contents !== "object") {
    return false;
  }
  const contents = row.contents as { kind?: unknown; sources?: unknown };
  if (contents.kind === "tool_generated_user_message" && Array.isArray((contents as { sources?: unknown }).sources)) {
    const sources = (contents as { sources: unknown[] }).sources;
    if (sources.some((source) => source && typeof source === "object" && ((source as { tool?: unknown }).tool === "reasoning_effort" || (source as { tool?: unknown }).tool === "thinking_level"))) {
      return false;
    }
  }
  return contents.kind === "user_message" || contents.kind === "tool_generated_user_message";
}

function compactOneLine(text: string): string {
  return truncateCompactLine(text.replace(/\s+/g, " ").trim(), 180);
}

function truncateCompactLine(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

function truncateCompactBlock(text: string): string {
  return text.length > 1200 ? `${text.slice(0, 1197)}...` : text;
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
    previous ? `Previous compact recall index:\n${previous}` : "",
    transcript ? `Recent session recall index source:\n${transcript}` : ""
  ].filter(Boolean).join("\n\n").slice(0, 48_000);
}
