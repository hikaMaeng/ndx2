import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import { settingsDocumentToAgentRuntimeSettings, settingsDocumentRow } from "../../common/settings/index.js";
import { runSelfcheckOnce } from "./run.js";
import type { NDXDatabase } from "../init/database.js";

test("settings document exposes selfcheck model and run budgets", () => {
  const row = settingsDocumentRow({
    selfcheck: {
      enabled: true,
      model: "selfcheck-model",
      defaultIntervalMs: 123,
      defaultBatchSize: 12,
      maxLlmAnalysesPerRun: 3,
      maxEvidenceChars: 4567
    }
  });

  assert.deepEqual(row.selfcheck, {
    enabled: true,
    model: "selfcheck-model",
    defaultIntervalMs: 123,
    defaultBatchSize: 12,
    maxLlmAnalysesPerRun: 3,
    maxEvidenceChars: 4567
  });
  assert.equal(settingsDocumentToAgentRuntimeSettings({ selfcheck: { enabled: true, model: "selfcheck-model" } }).selfcheck?.model, "selfcheck-model");
});

test("selfcheck run extracts failed tool candidates without calling the model in extract mode", async () => {
  const database = selfcheckMemoryDatabase([{
    dataid: "1",
    sessionid: "018f0000-0000-7000-8000-000000000000",
    type: "assistant",
    contents: {
      kind: "tool_result",
      iteration: 1,
      results: [{ toolCallId: "call_1", tool: "read_file", success: false, output: "ENOENT: no such file" }]
    },
    createdat: new Date()
  }], []);
  const result = await runSelfcheckOnce(database, { userHome: await fs.mkdtemp(path.join(os.tmpdir(), "ndx-selfcheck-")), mode: "extract", batchSize: 10 });

  assert.equal(result.createdCandidates, 1);
  assert.equal(database.candidates.length, 1);
  assert.equal(database.candidates[0].subjectname, "read_file");
});

function selfcheckMemoryDatabase(sessiondata: Array<Record<string, unknown>>, hookruns: Array<Record<string, unknown>>): NDXDatabase & { candidates: Array<Record<string, unknown>> } {
  let locked = false;
  const candidates: Array<Record<string, unknown>> = [];
  const cursors = new Map<string, string>();
  return {
    candidates,
    async close() {},
    async query<Row extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<Row>> {
      if (/pg_try_advisory_lock/i.test(text)) {
        locked = true;
        return queryResult([{ locked }] as unknown as Row[]);
      }
      if (/pg_advisory_unlock/i.test(text)) {
        locked = false;
        return queryResult([{ pg_advisory_unlock: true }] as unknown as Row[]);
      }
      if (/INSERT INTO selfcheck_analysis_run/i.test(text)) {
        return queryResult([{ runid: "018f0000-0000-7000-8000-000000000001" }] as unknown as Row[]);
      }
      if (/UPDATE selfcheck_analysis_run/i.test(text)) {
        return queryResult([] as Row[], 1);
      }
      if (/INSERT INTO selfcheck_analysis_cursor/i.test(text) && /RETURNING lastdataid/i.test(text)) {
        const analyzer = String(values[0]);
        return queryResult([{ lastdataid: cursors.get(analyzer) ?? "0" }] as unknown as Row[]);
      }
      if (/INSERT INTO selfcheck_analysis_cursor/i.test(text)) {
        cursors.set(String(values[0]), String(values[3]));
        return queryResult([] as Row[], 1);
      }
      if (/FROM sessiondata/i.test(text)) {
        const after = Number(values[0]);
        const rows = sessiondata.filter((row) => Number(row.dataid) > after) as unknown as Row[];
        return queryResult(rows);
      }
      if (/FROM selfcheck_hookrun/i.test(text)) {
        return queryResult(hookruns as unknown as Row[]);
      }
      if (/INSERT INTO selfcheck_analysis_candidate/i.test(text)) {
        candidates.push({
          subjectkind: values[0],
          subjectname: values[1],
          analyzer: values[2],
          sessionid: values[3],
          calldataid: values[4],
          resultdataid: values[5],
          hookrunid: values[6],
          fingerprint: values[7],
          reason: values[8],
          evidence: JSON.parse(String(values[9])) as unknown
        });
        return queryResult([{ inserted: true }] as unknown as Row[]);
      }
      return queryResult([] as unknown as Row[]);
    }
  };
}

function queryResult<Row extends QueryResultRow>(rows: Row[], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}
