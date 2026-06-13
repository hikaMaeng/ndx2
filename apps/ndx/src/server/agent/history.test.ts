import assert from "node:assert/strict";
import test from "node:test";
import type { NDXDatabase, NDXSessionDataRow, NDXSessionRow } from "ndx/agent";
import { buildSessionHistorySummary } from "./history.js";

test("history summary keeps interrupted turns interrupted even when partial assistant text was saved", async () => {
  const rows: NDXSessionDataRow[] = [
    row("1", "user", { kind: "user_message", text: "긴 작업" }),
    row("2", "assistant", { kind: "assistant_delta", iteration: 1, delta: "부분 응답", content: "부분 응답" }),
    row("3", "interrupt", { kind: "interrupt", requestedAt: "2026-05-12T00:00:03.000Z" }),
    row("4", "assistant", { kind: "assistant_message", text: "부분 응답" })
  ];
  const database: NDXDatabase = {
    async query() {
      return { rows, rowCount: rows.length } as never;
    },
    async close() {}
  };

  const summary = await buildSessionHistorySummary(database, session());

  assert.equal(summary.turns[0]?.status, "interrupted");
  assert.equal(summary.contextUsage.contextsize, 100000);
  assert.ok(summary.contextUsage.tokens > 0);
  assert.ok(summary.contextUsage.parts?.some((part) => part.key === "history" && part.tokens > 0));
  assert.deepEqual(summary.visibleEvents.map((event) => ({
    event: event.event,
    dataid: event.dataid,
    contents: event.contents
  })), [
    { event: "turn.input.recorded", dataid: "1", contents: { kind: "user_message", text: "긴 작업" } },
    { event: "turn.assistant.recorded", dataid: "4", contents: { kind: "assistant_message", text: "부분 응답" } }
  ]);
});

test("history summary exposes branch source input before the compact summary", async () => {
  const rows: NDXSessionDataRow[] = [
    row("1", "compact", {
      kind: "compact",
      text: "분기 전 요약",
      sourceRowCount: 3,
      createdReason: "branch",
      sourceInput: { dataId: "42", text: "원본 사용자 요청" }
    })
  ];
  const database: NDXDatabase = {
    async query() {
      return { rows, rowCount: rows.length } as never;
    },
    async close() {}
  };

  const summary = await buildSessionHistorySummary(database, session("🚩원본 사용자 요청"));

  assert.deepEqual(summary.visibleEvents.map((event) => ({
    event: event.event,
    dataid: event.dataid,
    contents: event.contents
  })), [
    { event: "turn.input.recorded", dataid: "branch-source:1:42", contents: { kind: "user_message", text: "원본 사용자 요청" } },
    { event: "turn.compact.completed", dataid: "1", contents: rows[0]?.contents }
  ]);
});

test("history summary falls back to branch session title when old compact rows lack source input metadata", async () => {
  const rows: NDXSessionDataRow[] = [
    row("1", "compact", {
      kind: "compact",
      text: "분기 전 요약",
      sourceRowCount: 3,
      createdReason: "branch"
    })
  ];
  const database: NDXDatabase = {
    async query() {
      return { rows, rowCount: rows.length } as never;
    },
    async close() {}
  };

  const summary = await buildSessionHistorySummary(database, session("🚩$web-deploy-docker apps/tetris"));

  assert.deepEqual(summary.visibleEvents.map((event) => ({
    event: event.event,
    dataid: event.dataid,
    contents: event.contents
  })), [
    { event: "turn.input.recorded", dataid: "branch-source:1:1", contents: { kind: "user_message", text: "$web-deploy-docker apps/tetris" } },
    { event: "turn.compact.completed", dataid: "1", contents: rows[0]?.contents }
  ]);
});

function row(dataid: string, type: string, contents: unknown): NDXSessionDataRow {
  return {
    dataid,
    sessionid: "session-1",
    type,
    contents,
    createdat: new Date(`2026-05-12T00:00:0${dataid}.000Z`)
  };
}

function session(title = "test"): NDXSessionRow {
  return {
    sessionid: "session-1",
    userid: "ndev",
    title,
    lastupdated: new Date("2026-05-12T00:00:00.000Z"),
    mode: "none",
    path: "/ndx/workspace/project-1",
    projectname: "project-1",
    model: { type: "openai", model: "gpt-test", url: "https://example.test", token: "", contextsize: 100000 },
    isrunning: false,
    turnphase: "idle",
    interruptrequested: false,
    interruptrequestedat: null,
    interruptcompletedat: null
  };
}
