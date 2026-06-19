import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import { appendCompactSessionHistory, compactReplayContents, compactSessionHistory, sessionDataRowsForModelContext, sessionDataRowsFromLatestCompact } from "./index.js";
import type { NDXDatabase, NDXModelConfig, NDXSessionDataRow, NDXSessionRow } from "../session/types.js";

test("sessionDataRowsFromLatestCompact keeps only the latest compact row and following rows", () => {
  const rows: NDXSessionDataRow[] = [
    row("1", "user", { kind: "user_message", text: "old" }),
    row("2", "compact", { kind: "compact", text: "first", sourceRowCount: 1, createdReason: "limit" }),
    row("3", "user", { kind: "user_message", text: "middle" }),
    row("4", "compact", { kind: "compact", text: "latest", sourceRowCount: 2, createdReason: "limit" }),
    row("5", "user", { kind: "user_message", text: "next" })
  ];

  assert.deepEqual(sessionDataRowsFromLatestCompact(rows).map((item) => item.dataid), ["4", "5"]);
});

test("sessionDataRowsForModelContext keeps compact summary and following rows", () => {
  const rows: NDXSessionDataRow[] = [
    row("1", "compact", { kind: "compact", text: "summary", sourceRowCount: 4, createdReason: "limit" }),
    row("2", "user", { kind: "user_message", text: "one" }),
    row("3", "assistant", { kind: "assistant_message", text: "done" }),
    row("4", "user", { kind: "user_message", text: "two" })
  ];

  assert.deepEqual(sessionDataRowsForModelContext(rows).map((item) => item.dataid), ["1", "2", "3", "4"]);
});

test("sessionDataRowsForModelContext drops skill context before latest compact", () => {
  const rows: NDXSessionDataRow[] = [
    row("1", "system", {
      kind: "skill_context",
      name: "demo",
      path: "/workspace/.ndx/skills/demo/SKILL.md",
      text: "<skill><name>demo</name><path>/workspace/.ndx/skills/demo/SKILL.md</path><body>old</body></skill>"
    }),
    row("2", "user", { kind: "user_message", text: "old request" }),
    row("3", "compact", { kind: "compact", text: "summary", sourceRowCount: 2, createdReason: "limit" }),
    row("4", "user", { kind: "user_message", text: "next request" })
  ];

  assert.deepEqual(sessionDataRowsForModelContext(rows).map((item) => item.dataid), ["3", "4"]);
});

test("sessionDataRowsForModelContext keeps skill context after latest compact", () => {
  const rows: NDXSessionDataRow[] = [
    row("1", "compact", { kind: "compact", text: "summary", sourceRowCount: 2, createdReason: "limit" }),
    row("2", "system", {
      kind: "skill_context",
      name: "demo",
      path: "/workspace/.ndx/skills/demo/SKILL.md",
      text: "<skill><name>demo</name><path>/workspace/.ndx/skills/demo/SKILL.md</path><body>current</body></skill>"
    }),
    row("3", "user", { kind: "user_message", text: "next request" })
  ];

  assert.deepEqual(sessionDataRowsForModelContext(rows).map((item) => item.dataid), ["1", "2", "3"]);
});

test("compactSessionHistory uses supplied model context rows as compact source rows", async () => {
  const rows: NDXSessionDataRow[] = [
    row("1", "compact", { kind: "compact", text: "summary", sourceRowCount: 4, createdReason: "limit" }),
    row("2", "user", { kind: "user_message", text: "old" }),
    row("3", "assistant", { kind: "assistant_message", text: "old answer" }),
    row("4", "user", { kind: "user_message", text: "recent" })
  ];
  const database = memorySessionDataDatabase(rows);
  const compact = await compactSessionHistory(database, session(), compactReport(), modelWithoutProvider(), {
    contextRows: sessionDataRowsForModelContext(rows)
  });

  assert.equal(compact.previousCompact?.dataid, "1");
  assert.deepEqual(compact.sourceRows.map((item) => item.dataid), ["2", "3", "4"]);
  assert.equal((compact.row.contents as { sourceStartDataId?: string }).sourceStartDataId, "2");
  assert.equal((compact.row.contents as { sourceEndDataId?: string }).sourceEndDataId, "4");
  assert.equal((compact.row.contents as { sourceRowCount?: number }).sourceRowCount, 3);
  assert.equal(typeof compact.fallbackReason, "string");
  assert.equal(typeof (compact.row.contents as { fallbackReason?: unknown }).fallbackReason, "string");
});

test("compactSessionHistory default source rows still start after latest compact", async () => {
  const rows: NDXSessionDataRow[] = [
    row("1", "compact", { kind: "compact", text: "summary", sourceRowCount: 4, createdReason: "limit" }),
    row("2", "user", { kind: "user_message", text: "next" }),
    row("3", "assistant", { kind: "assistant_message", text: "done" })
  ];
  const database = memorySessionDataDatabase(rows);
  const compact = await compactSessionHistory(database, session(), compactReport(), modelWithoutProvider());

  assert.deepEqual(compact.sourceRows.map((item) => item.dataid), ["2", "3"]);
});

test("appendCompactSessionHistory throw fallback mode surfaces compact model failure without appending", async () => {
  const rows: NDXSessionDataRow[] = [
    row("1", "user", { kind: "user_message", text: "branch this" }),
    row("2", "assistant", { kind: "assistant_message", text: "done" })
  ];
  const database = memorySessionDataDatabase(rows);

  await assert.rejects(
    appendCompactSessionHistory(database, session(), compactReport(), rows, modelWithoutProvider(), { fallbackMode: "throw" }),
    /이전 히스토리 compact 생성에 실패했습니다/
  );
  assert.deepEqual(rows.map((item) => item.dataid), ["1", "2"]);
});

test("appendCompactSessionHistory fallback preserves recallable dataid range anchors", async () => {
  const rows: NDXSessionDataRow[] = [
    row("1", "user", { kind: "user_message", text: "packages/ndx/src/agent/compact/index.ts 오류를 고쳐줘" }),
    row("2", "assistant", { kind: "tool_call", iteration: 1, toolCalls: [{ type: "function_call", call_id: "call-1", name: "bash", arguments: "{\"cmd\":\"yarn test\"}" }] }),
    row("3", "assistant", { kind: "tool_result", iteration: 1, results: [{ toolCallId: "call-1", tool: "bash", success: false, output: "test failed" }] }),
    row("4", "assistant", { kind: "assistant_message", text: "테스트 실패를 확인했고 수정이 필요합니다." })
  ];
  const database = memorySessionDataDatabase(rows);
  const compact = await appendCompactSessionHistory(database, session(), compactReport(), rows, modelWithoutProvider());

  assert.match(compact.text, /\[dataid:1-4\]/);
  assert.match(compact.text, /session_history \{"mode":"recall","scope":"session","startDataId":"1","endDataId":"4"\}/);
  assert.match(compact.text, /Failed tool results: bash call-1/);
  assert.equal((compact.row.contents as { sourceStartDataId?: string }).sourceStartDataId, "1");
  assert.equal((compact.row.contents as { sourceEndDataId?: string }).sourceEndDataId, "4");
});

test("compactReplayContents preserves rows after an iteration compact without making them compact source", () => {
  const replay = compactReplayContents([
    row("4", "user", { kind: "user_message", text: "current request" }),
    row("5", "tool_call", { kind: "tool_call", iteration: 1, toolCalls: [{ type: "function_call", call_id: "call-1", name: "read", arguments: "{}" }] }),
    row("6", "assistant", { kind: "tool_result", iteration: 1, results: [{ toolCallId: "call-1", tool: "read", success: true, output: "ok" }] })
  ]);

  assert.equal(replay.kind, "compact_replay");
  assert.equal(replay.sourceStartDataId, "4");
  assert.equal(replay.sourceEndDataId, "6");
  assert.equal(replay.sourceRowCount, 3);
  assert.deepEqual(replay.rows.map((item) => item.dataid), ["4", "5", "6"]);
});

function row(dataid: string, type: string, contents: unknown): NDXSessionDataRow {
  return {
    dataid,
    sessionid: "018f0000-0000-7000-8000-000000000001",
    type,
    contents,
    createdat: new Date("2026-05-12T00:00:00.000Z")
  };
}

function session(): NDXSessionRow {
  return {
    sessionid: "018f0000-0000-7000-8000-000000000001",
    userid: "ndev",
    title: "",
    lastupdated: new Date("2026-05-12T00:00:00.000Z"),
    mode: "none",
    path: "/workspace",
    projectname: "project",
    model: modelWithoutProvider(),
    isrunning: false,
    turnphase: "idle",
    interruptrequested: false,
    interruptrequestedat: null,
    interruptcompletedat: null
  };
}

function modelWithoutProvider(): NDXModelConfig {
  return {
    type: "openai",
    model: "test-model",
    url: "",
    token: "",
    contextsize: 8192
  };
}

function compactReport() {
  return {
    phase: "turn_start" as const,
    reason: "context_limit",
    tokens: 7000,
    contextsize: 8192,
    percent: 85,
    remainingTokens: 1192,
    requiredTokens: 2048,
    averageTurnTokens: 1024,
    outputReserveTokens: 1024
  };
}

function memorySessionDataDatabase(rows: NDXSessionDataRow[]): NDXDatabase {
  let nextDataId = 100;
  return {
    async query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
      if (text.includes("SELECT dataid, sessionid, type, contents, createdat")) {
        return queryResult(rows as unknown as Row[]);
      }
      if (text.includes("INSERT INTO sessiondata")) {
        const appended = row(String(nextDataId++), String(values?.[1]), JSON.parse(String(values?.[2])));
        rows.push(appended);
        return queryResult([appended as unknown as Row]);
      }
      if (text.includes('UPDATE "session"')) {
        return queryResult([] as Row[]);
      }
      throw new Error(`unexpected query: ${text}`);
    },
    async close() {}
  };
}

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows
  };
}
