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

function row(dataid: string, type: string, contents: unknown): NDXSessionDataRow {
  return {
    dataid,
    sessionid: "session-1",
    type,
    contents,
    createdat: new Date(`2026-05-12T00:00:0${dataid}.000Z`)
  };
}

function session(): NDXSessionRow {
  return {
    sessionid: "session-1",
    userid: "ndev",
    title: "test",
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
