import { createHash } from "node:crypto";
import { requestModelResponse } from "ndx/common/responseapi";
import {
  DEFAULT_NDX_SELFCHECK_BATCH_SIZE,
  DEFAULT_NDX_SELFCHECK_MAX_EVIDENCE_CHARS,
  DEFAULT_NDX_SELFCHECK_MAX_LLM_ANALYSES_PER_RUN,
  readNDXSettingsDocument,
  resolveSettingsModelConfig,
  settingsDocumentToAgentRuntimeSettings
} from "../../common/settings/index.js";
import type { NDXDatabase } from "../init/database.js";
import type { NDXSelfcheckCandidateRow, NDXSelfcheckRunOptions } from "./types.js";

export const NDX_SELFCHECK_PROMPT_VERSION = "selfcheck-runtime-analysis-v1";

type SessionDataScanRow = {
  dataid: string;
  sessionid: string;
  type: string;
  contents: unknown;
  createdat: Date;
};

type HookRunScanRow = {
  hookrunserial: string;
  hookrunid: string;
  sessionid: string | null;
  eventname: string;
  hookname: string | null;
  status: string;
  effectsummary: unknown;
  stoppedturn: boolean;
  interruptedresponse: boolean;
  replacedrequest: boolean;
  replacedtoolcalls: boolean;
  replacedtoolresults: boolean;
  finalassistanttext: string | null;
  error: string | null;
  relateddataids: string[];
};

type LlmSelfcheckResult = {
  isActionable?: unknown;
  category?: unknown;
  severity?: unknown;
  title?: unknown;
  diagnosis?: unknown;
  evidenceSummary?: unknown;
  recommendedChange?: unknown;
  confidence?: unknown;
  requiresHumanReview?: unknown;
};

export async function runSelfcheckOnce(database: NDXDatabase, options: NDXSelfcheckRunOptions): Promise<{ runid: string; createdCandidates: number; llmAnalyses: number; createdChecks: number; dedupedChecks: number }> {
  const mode = options.mode ?? "all";
  const batchSize = Math.min(Math.max(options.batchSize ?? DEFAULT_NDX_SELFCHECK_BATCH_SIZE, 1), 2_000);
  const maxLlmAnalyses = Math.min(Math.max(options.maxLlmAnalyses ?? DEFAULT_NDX_SELFCHECK_MAX_LLM_ANALYSES_PER_RUN, 0), 200);
  const maxEvidenceChars = Math.min(Math.max(options.maxEvidenceChars ?? DEFAULT_NDX_SELFCHECK_MAX_EVIDENCE_CHARS, 1_000), 200_000);
  const advisory = await database.query<{ locked: boolean }>(`SELECT pg_try_advisory_lock(hashtext('ndx:selfcheck')) AS locked;`);
  if (!advisory.rows[0]?.locked) {
    throw new Error("selfcheck analyzer is already running.");
  }
  const run = await database.query<{ runid: string }>(
    `
INSERT INTO selfcheck_analysis_run (analyzer, subjectkind, subjectname, status)
VALUES ('runtime.selfcheck.v1', 'tool', '*', 'running')
RETURNING runid;
`
  );
  const runid = run.rows[0].runid;
  let createdCandidates = 0;
  let llmAnalyses = 0;
  let createdChecks = 0;
  let dedupedChecks = 0;
  try {
    if (mode === "extract" || mode === "all") {
      createdCandidates += await extractToolCandidates(database, batchSize);
      createdCandidates += await extractHookCandidates(database, batchSize);
    }
    if (mode === "analyze" || mode === "all") {
      const result = await analyzePendingCandidates(database, { ...options, maxLlmAnalyses, maxEvidenceChars });
      llmAnalyses = result.llmAnalyses;
      createdChecks = result.createdChecks;
      dedupedChecks = result.dedupedChecks;
    }
    await database.query(
      `
UPDATE selfcheck_analysis_run
SET completedat = now(), createdcandidates = $2, llmanalyses = $3, createdchecks = $4, dedupedchecks = $5, status = 'completed'
WHERE runid = $1;
`,
      [runid, createdCandidates, llmAnalyses, createdChecks, dedupedChecks]
    );
    return { runid, createdCandidates, llmAnalyses, createdChecks, dedupedChecks };
  } catch (error) {
    await database.query(
      `
UPDATE selfcheck_analysis_run
SET completedat = now(), status = 'failed', error = $2
WHERE runid = $1;
`,
      [runid, error instanceof Error ? error.message : String(error)]
    );
    throw error;
  } finally {
    await database.query(`SELECT pg_advisory_unlock(hashtext('ndx:selfcheck'));`).catch(() => undefined);
  }
}

async function extractToolCandidates(database: NDXDatabase, batchSize: number): Promise<number> {
  const cursor = await readCursor(database, "tool:*", "tool", "*");
  const rows = await database.query<SessionDataScanRow>(
    `
SELECT dataid, sessionid, type, contents, createdat
FROM sessiondata
WHERE dataid > $1
  AND contents->>'kind' = 'tool_result'
ORDER BY dataid
LIMIT $2;
`,
    [cursor, batchSize]
  );
  let created = 0;
  for (const row of rows.rows) {
    for (const candidate of toolCandidatesFromRow(row)) {
      created += await upsertCandidate(database, candidate);
    }
  }
  await writeCursor(database, "tool:*", "tool", "*", rows.rows.at(-1)?.dataid ?? cursor, "completed");
  return created;
}

async function extractHookCandidates(database: NDXDatabase, batchSize: number): Promise<number> {
  const cursor = await readCursor(database, "hook:*", "hook", "*");
  const rows = await database.query<HookRunScanRow>(
    `
SELECT hookrunserial, hookrunid, sessionid, eventname, hookname, status, effectsummary, stoppedturn, interruptedresponse,
       replacedrequest, replacedtoolcalls, replacedtoolresults, finalassistanttext, error, relateddataids
FROM selfcheck_hookrun
WHERE hookrunserial > $1
ORDER BY hookrunserial
LIMIT $2;
`,
    [cursor, batchSize]
  );
  let created = 0;
  for (const row of rows.rows) {
    if (!hookRunIsCandidate(row)) continue;
    created += await upsertCandidate(database, {
      subjectkind: "hook",
      subjectname: row.eventname,
      analyzer: "hook:*.v1",
      sessionid: row.sessionid,
      calldataid: null,
      resultdataid: null,
      hookrunid: row.hookrunid,
      fingerprint: fingerprint(["hook", row.eventname, row.status, hookReason(row), String(row.hookname ?? "")]),
      reason: hookReason(row),
      evidence: row
    });
  }
  await writeCursor(database, "hook:*", "hook", "*", rows.rows.at(-1)?.hookrunserial ?? cursor, "completed");
  return created;
}

async function analyzePendingCandidates(database: NDXDatabase, options: NDXSelfcheckRunOptions & { maxLlmAnalyses: number; maxEvidenceChars: number }): Promise<{ llmAnalyses: number; createdChecks: number; dedupedChecks: number }> {
  const settings = await readNDXSettingsDocument(options.userHome);
  const runtime = settingsDocumentToAgentRuntimeSettings(settings);
  const modelKey = runtime.selfcheck?.model;
  if (!modelKey) {
    return { llmAnalyses: 0, createdChecks: 0, dedupedChecks: 0 };
  }
  const resolved = resolveSettingsModelConfig(settings, modelKey, 100_000);
  if (!resolved) {
    throw new Error(`selfcheck model cannot be resolved: ${modelKey}`);
  }
  const pending = await database.query<NDXSelfcheckCandidateRow>(
    `
SELECT *
FROM selfcheck_analysis_candidate
WHERE status IN ('pending', 'failed') AND attemptcount < 3
ORDER BY createdat
LIMIT $1;
`,
    [options.maxLlmAnalyses]
  );
  let llmAnalyses = 0;
  let createdChecks = 0;
  let dedupedChecks = 0;
  for (const candidate of pending.rows) {
    await database.query(`UPDATE selfcheck_analysis_candidate SET status = 'analyzing', attemptcount = attemptcount + 1, lastattemptat = now(), updatedat = now() WHERE candidateid = $1;`, [candidate.candidateid]);
    try {
      const evidenceText = JSON.stringify(candidate.evidence, null, 2).slice(0, options.maxEvidenceChars);
      const raw = options.modelCaller
        ? await options.modelCaller({ model: resolved.model, promptVersion: NDX_SELFCHECK_PROMPT_VERSION, candidate, evidenceText, database })
        : await callSelfcheckModel(resolved.model, candidate, evidenceText, database);
      const parsed = parseLlmSelfcheck(raw);
      llmAnalyses += 1;
      if (parsed.isActionable !== true) {
        await database.query(`UPDATE selfcheck_analysis_candidate SET status = 'skipped', updatedat = now(), lasterror = NULL WHERE candidateid = $1;`, [candidate.candidateid]);
        continue;
      }
      const upserted = await upsertSelfcheckFromLlm(database, candidate, resolved.key, resolved.model, raw, parsed);
      createdChecks += upserted === "created" ? 1 : 0;
      dedupedChecks += upserted === "deduped" ? 1 : 0;
      await database.query(`UPDATE selfcheck_analysis_candidate SET status = 'analyzed', updatedat = now(), lasterror = NULL WHERE candidateid = $1;`, [candidate.candidateid]);
    } catch (error) {
      await database.query(
        `UPDATE selfcheck_analysis_candidate SET status = 'failed', updatedat = now(), lasterror = $2 WHERE candidateid = $1;`,
        [candidate.candidateid, error instanceof Error ? error.message : String(error)]
      );
    }
  }
  return { llmAnalyses, createdChecks, dedupedChecks };
}

function toolCandidatesFromRow(row: SessionDataScanRow): Array<{ subjectkind: "tool"; subjectname: string; analyzer: string; sessionid: string; calldataid: null; resultdataid: string; hookrunid: null; fingerprint: string; reason: string; evidence: unknown }> {
  const contents = row.contents && typeof row.contents === "object" && !Array.isArray(row.contents) ? row.contents as { iteration?: unknown; results?: unknown } : {};
  const results = Array.isArray(contents.results) ? contents.results : [];
  const candidates = [];
  for (const result of results) {
    if (!result || typeof result !== "object" || Array.isArray(result)) continue;
    const record = result as { tool?: unknown; toolCallId?: unknown; success?: unknown; output?: unknown };
    const tool = typeof record.tool === "string" && record.tool.trim() ? record.tool.trim() : "unknown";
    const output = stringifyEvidence(record.output);
    const reason = toolResultReason(record.success === true, output);
    if (!reason) continue;
    candidates.push({
      subjectkind: "tool" as const,
      subjectname: tool,
      analyzer: "tool:*.v1",
      sessionid: row.sessionid,
      calldataid: null,
      resultdataid: row.dataid,
      hookrunid: null,
      fingerprint: fingerprint(["tool", tool, reason, outputClass(output)]),
      reason,
      evidence: {
        row: { dataid: row.dataid, sessionid: row.sessionid, createdat: row.createdat },
        iteration: contents.iteration,
        result
      }
    });
  }
  return candidates;
}

function toolResultReason(success: boolean, output: string): string | undefined {
  const normalized = output.toLowerCase().replace(/\s+/g, " ").trim();
  if (!success) return "tool_result_failed";
  if (!normalized) return "tool_result_empty";
  if (/\b(0 results|0 matches|no results|no matches|not found|nothing found|empty result)\b/.test(normalized)) return "tool_result_no_useful_matches";
  if (normalized.length < 8) return "tool_result_too_short_to_be_useful";
  return undefined;
}

function hookRunIsCandidate(row: HookRunScanRow): boolean {
  return row.status === "failed"
    || row.stoppedturn
    || row.interruptedresponse
    || row.replacedrequest
    || row.replacedtoolcalls
    || row.replacedtoolresults
    || Boolean(row.finalassistanttext?.trim());
}

function hookReason(row: HookRunScanRow): string {
  if (row.status === "failed") return "hook_failed";
  if (row.stoppedturn) return "hook_stopped_turn";
  if (row.interruptedresponse) return "hook_interrupted_model_response";
  if (row.replacedrequest) return "hook_replaced_request";
  if (row.replacedtoolcalls) return "hook_replaced_tool_calls";
  if (row.replacedtoolresults) return "hook_replaced_tool_results";
  return "hook_produced_final_assistant_text";
}

async function upsertCandidate(database: NDXDatabase, candidate: {
  subjectkind: "tool" | "hook";
  subjectname: string;
  analyzer: string;
  sessionid: string | null;
  calldataid: string | null;
  resultdataid: string | null;
  hookrunid: string | null;
  fingerprint: string;
  reason: string;
  evidence: unknown;
}): Promise<number> {
  const result = await database.query<{ inserted: boolean }>(
    `
INSERT INTO selfcheck_analysis_candidate (subjectkind, subjectname, analyzer, sessionid, calldataid, resultdataid, hookrunid, fingerprint, reason, evidence)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
ON CONFLICT (analyzer, subjectkind, subjectname, fingerprint)
DO UPDATE SET updatedat = now()
RETURNING xmax = 0 AS inserted;
`,
    [candidate.subjectkind, candidate.subjectname, candidate.analyzer, candidate.sessionid, candidate.calldataid, candidate.resultdataid, candidate.hookrunid, candidate.fingerprint, candidate.reason, JSON.stringify(candidate.evidence)]
  );
  return result.rows[0]?.inserted ? 1 : 0;
}

async function upsertSelfcheckFromLlm(
  database: NDXDatabase,
  candidate: NDXSelfcheckCandidateRow,
  modelKey: string,
  model: unknown,
  raw: string,
  parsed: LlmSelfcheckResult
): Promise<"created" | "deduped"> {
  const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : `${candidate.subjectname} selfcheck`;
  const summary = typeof parsed.diagnosis === "string" && parsed.diagnosis.trim() ? parsed.diagnosis.trim() : title;
  const result = await database.query<{ inserted: boolean }>(
    `
INSERT INTO selfcheck (
  subjectkind, subjectname, category, severity, status, fingerprint, title, summary, evidence, recommendation,
  confidence, model, promptversion, analysiskind, llmraw, targetsessionid, targetdataid, targetiteration, targetcallid, targethookrunid, sampledataids
)
VALUES ($1, $2, $3, $4, 'open', $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11::jsonb, $12, 'llm', $13::jsonb, $14, $15, $16, $17, $18, $19::bigint[])
ON CONFLICT (analysiskind, subjectkind, subjectname, fingerprint)
DO UPDATE SET
  lastseenat = now(),
  occurrencecount = selfcheck.occurrencecount + 1,
  sampledataids = (
    SELECT ARRAY(SELECT DISTINCT item FROM unnest(selfcheck.sampledataids || EXCLUDED.sampledataids) AS item LIMIT 20)
  ),
  updatedat = now()
RETURNING xmax = 0 AS inserted;
`,
    [
      candidate.subjectkind,
      candidate.subjectname,
      typeof parsed.category === "string" && parsed.category.trim() ? parsed.category.trim() : "runtime_selfcheck",
      typeof parsed.severity === "string" && parsed.severity.trim() ? parsed.severity.trim() : "info",
      candidate.fingerprint,
      title.slice(0, 500),
      summary.slice(0, 10_000),
      JSON.stringify({
        candidate: candidate.evidence,
        llmEvidenceSummary: typeof parsed.evidenceSummary === "string" ? parsed.evidenceSummary : ""
      }),
      JSON.stringify(parsed.recommendedChange ?? {}),
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence) ? parsed.confidence : null,
      JSON.stringify({ key: modelKey, model }),
      NDX_SELFCHECK_PROMPT_VERSION,
      JSON.stringify(parsedJson(raw) ?? { raw }),
      candidate.sessionid,
      candidate.resultdataid ?? candidate.calldataid,
      null,
      null,
      candidate.hookrunid,
      candidate.resultdataid ? [candidate.resultdataid] : candidate.calldataid ? [candidate.calldataid] : []
    ]
  );
  return result.rows[0]?.inserted ? "created" : "deduped";
}

async function callSelfcheckModel(model: { model: string; url: string; token: string; reasoningEffort?: "low" | "medium" | "high"; temperature?: number; topP?: number; topK?: number; minP?: number }, candidate: NDXSelfcheckCandidateRow, evidenceText: string, database: NDXDatabase): Promise<string> {
  const response = await requestModelResponse(
    model,
    [
      {
        role: "system",
        content: [
          "You analyze runtime evidence from a coding agent.",
          "Return only JSON. Do not modify code.",
          "Classify whether the evidence suggests an actionable improvement to a tool, hook, prompt/context, settings, documentation, or implementation.",
          "If evidence is weak, set isActionable to false."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          promptVersion: NDX_SELFCHECK_PROMPT_VERSION,
          expectedJson: {
            isActionable: true,
            category: "tool_description | tool_error_message | tool_schema | tool_bug | hook_policy | hook_message | base_context_guidance | settings | documentation | analyzer_noise",
            severity: "info | low | medium | high",
            title: "short title",
            diagnosis: "why this happened",
            evidenceSummary: "what evidence supports the diagnosis",
            recommendedChange: { target: "tool | hook | prompt | settings | docs | implementation", change: "manual improvement proposal" },
            confidence: 0.0,
            requiresHumanReview: true
          },
          candidate: {
            subjectkind: candidate.subjectkind,
            subjectname: candidate.subjectname,
            reason: candidate.reason
          },
          evidence: evidenceText
        }, null, 2)
      }
    ],
    [],
    {
      onDebug: async (event, context) => {
        database.logger?.debug(event, { surface: "selfcheck", ...context });
      }
    }
  );
  return response.content;
}

function parseLlmSelfcheck(raw: string): LlmSelfcheckResult {
  const parsed = parsedJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("selfcheck model did not return a JSON object.");
  }
  return parsed as LlmSelfcheckResult;
}

async function readCursor(database: NDXDatabase, analyzer: string, subjectkind: "tool" | "hook", subjectname: string): Promise<string> {
  const result = await database.query<{ lastdataid: string }>(
    `
INSERT INTO selfcheck_analysis_cursor (analyzer, subjectkind, subjectname, laststartedat, laststatus)
VALUES ($1, $2, $3, now(), 'running')
ON CONFLICT (analyzer)
DO UPDATE SET laststartedat = now(), laststatus = 'running', lasterror = NULL, updatedat = now()
RETURNING lastdataid;
`,
    [analyzer, subjectkind, subjectname]
  );
  return result.rows[0]?.lastdataid ?? "0";
}

async function writeCursor(database: NDXDatabase, analyzer: string, subjectkind: "tool" | "hook", subjectname: string, lastdataid: string, status: string): Promise<void> {
  await database.query(
    `
INSERT INTO selfcheck_analysis_cursor (analyzer, subjectkind, subjectname, lastdataid, lastcompletedat, laststatus)
VALUES ($1, $2, $3, $4, now(), $5)
ON CONFLICT (analyzer)
DO UPDATE SET lastdataid = $4, lastcompletedat = now(), laststatus = $5, updatedat = now();
`,
    [analyzer, subjectkind, subjectname, lastdataid, status]
  );
}

function fingerprint(parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function outputClass(output: string): string {
  const normalized = output.toLowerCase();
  if (!normalized.trim()) return "empty";
  if (/\b(0 results|0 matches|no results|no matches)\b/.test(normalized)) return "zero_results";
  if (/\b(not found|enoent|no such file)\b/.test(normalized)) return "not_found";
  if (/\b(timeout|timed out)\b/.test(normalized)) return "timeout";
  if (/\b(permission denied|eacces)\b/.test(normalized)) return "permission";
  return normalized.replace(/["'`].*?["'`]/g, "<value>").replace(/\d+/g, "<number>").slice(0, 200);
}

function stringifyEvidence(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parsedJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) as unknown : undefined;
  }
}
