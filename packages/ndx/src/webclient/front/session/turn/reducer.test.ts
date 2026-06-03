import assert from "node:assert/strict";
import test from "node:test";
import { NDX_TURN_EVENT, type NDXSessionEventMessage } from "ndx/common/protocol";
import { applyTurnEvent } from "./reducer.js";

test("turn reducer restores file references and skills from durable tool results", () => {
  const input = event("turn.input.recorded", NDX_TURN_EVENT.InputRecorded, { text: "inspect files" });
  const results = event("turn.tool.result", NDX_TURN_EVENT.ToolResultRecorded, {
    kind: "tool_result",
    iteration: 1,
    results: [
      {
        toolCallId: "read-1",
        tool: "read_file",
        success: true,
        output: JSON.stringify({ path: "/project/src/a.ts", content: "alpha" })
      },
      {
        toolCallId: "skill-1",
        tool: "loadSkill",
        success: true,
        output: "<skill>\n<name>demo</name>\n<path>/project/.ndx/skills/demo/SKILL.md</path>\nUse demo.\n</skill>"
      }
    ]
  });

  const turn = [input, results].reduce(applyTurnEvent, []).at(-1);

  assert.deepEqual(turn?.sidebarItems.map((item) => ({
    group: item.group,
    key: item.key,
    title: item.title,
    body: item.body,
    kind: item.kind
  })), [
    {
      group: { id: "file-references", title: "파일참조" },
      key: "file-reference:/project/src/a.ts",
      title: "a.ts",
      body: "/project/src/a.ts",
      kind: "file_reference"
    },
    {
      group: { id: "skills", title: "스킬" },
      key: "skill:demo:/project/.ndx/skills/demo/SKILL.md",
      title: "demo",
      body: "/project/.ndx/skills/demo/SKILL.md",
      kind: "skill"
    }
  ]);
});

test("turn reducer restores web fetch and search sidebar items from durable tool results", () => {
  const input = event("turn.input.recorded", NDX_TURN_EVENT.InputRecorded, { text: "check web" });
  const results = event("turn.tool.result", NDX_TURN_EVENT.ToolResultRecorded, {
    kind: "tool_result",
    iteration: 1,
    results: [
      {
        toolCallId: "fetch-1",
        tool: "web_fetch",
        success: true,
        output: JSON.stringify({
          url: "https://example.com/docs",
          finalUrl: "https://example.com/docs",
          status: 200,
          contentType: "text/html; charset=utf-8",
          bytes: 1536,
          truncated: true
        })
      },
      {
        toolCallId: "search-1",
        tool: "web_search",
        success: true,
        output: JSON.stringify({
          query: "ndx sidebar cards",
          provider: "duckduckgo",
          durationSeconds: 0.42,
          results: [
            { title: "One", url: "https://example.com/one", source: "example.com" },
            { title: "Two", url: "https://docs.example.org/two" }
          ]
        })
      }
    ]
  });

  const items = [input, results].reduce(applyTurnEvent, []).at(-1)?.sidebarItems ?? [];

  assert.deepEqual(items.map((item) => ({
    group: item.group,
    title: item.title,
    kind: item.kind
  })), [
    { group: { id: "web-references", title: "웹 참조" }, title: "example.com", kind: "web_fetch" },
    { group: { id: "web-searches", title: "웹 검색" }, title: "ndx sidebar cards", kind: "web_search" }
  ]);
  assert.match(items[0]?.body ?? "", /200/);
  assert.match(items[0]?.body ?? "", /일부만 표시/);
  assert.match(items[1]?.body ?? "", /duckduckgo/);
  assert.match(items[1]?.body ?? "", /2개 결과/);
});

test("turn reducer summarizes function tool results for sidebar cards", () => {
  const input = event("turn.input.recorded", NDX_TURN_EVENT.InputRecorded, { text: "use function tools" });
  const calls = event("turn.tool.batch:1", NDX_TURN_EVENT.ToolBatchStarted, {
    kind: "tool_call",
    iteration: 1,
    toolCalls: [
      {
        type: "function_call",
        call_id: "question-1",
        name: "askUserQuestion",
        arguments: JSON.stringify({
          questions: [
            { id: "mode", header: "모드", question: "어떤 모드?", inputType: "single_choice" },
            { id: "token", header: "토큰", question: "토큰?", inputType: "secret" }
          ]
        })
      },
      { type: "function_call", call_id: "rewrite-1", name: "prompt_rewrite", arguments: "{}" },
      { type: "function_call", call_id: "history-1", name: "session_history", arguments: JSON.stringify({ scope: "project", query: "이전 설계" }) }
    ]
  });
  const results = event("turn.tool.result", NDX_TURN_EVENT.ToolResultRecorded, {
    kind: "tool_result",
    iteration: 1,
    results: [
      {
        toolCallId: "question-1",
        tool: "askUserQuestion",
        success: true,
        output: JSON.stringify({
          answers: {
            mode: { answers: ["상세 구현"] },
            token: { answers: ["super-secret-token"] }
          }
        })
      },
      {
        toolCallId: "rewrite-1",
        tool: "prompt_rewrite",
        success: true,
        output: JSON.stringify({
          rewritten_prompt: "목표: 오른쪽 사이드바 항목을 구현한다.",
          report: "프롬프트를 구체화했다.",
          should_ask_user: true,
          pass_through: false
        })
      },
      {
        toolCallId: "history-1",
        tool: "session_history",
        success: true,
        output: JSON.stringify({
          mode: "fts",
          scope: { type: "project", projectname: "project-1" },
          query: "이전 설계",
          results: [
            { dataid: "1", sessionid: "session-1", title: "사이드바 설계", path: "/repo" }
          ]
        })
      }
    ]
  });

  const items = [input, calls, results].reduce(applyTurnEvent, []).at(-1)?.sidebarItems ?? [];
  const byKind = new Map(items.map((item) => [item.kind, item]));

  assert.match(byKind.get("ask_user_question")?.body ?? "", /모드: 상세 구현/);
  assert.match(byKind.get("ask_user_question")?.body ?? "", /토큰: 비밀 응답 완료/);
  assert.doesNotMatch(byKind.get("ask_user_question")?.body ?? "", /super-secret-token/);
  assert.match(byKind.get("prompt_rewrite")?.body ?? "", /사용자 확인 권장/);
  assert.match(byKind.get("prompt_rewrite")?.body ?? "", /오른쪽 사이드바 항목/);
  assert.match(byKind.get("session_history")?.body ?? "", /project:project-1/);
  assert.match(byKind.get("session_history")?.body ?? "", /1개 결과/);
});

test("turn reducer deduplicates live and durable sidebar items by stable keys", () => {
  const input = event("turn.input.recorded", NDX_TURN_EVENT.InputRecorded, { text: "search web" });
  const calls = event("turn.tool.batch:1", NDX_TURN_EVENT.ToolBatchStarted, {
    kind: "tool_call",
    iteration: 1,
    toolCalls: [{ type: "function_call", call_id: "search-1", name: "web_search", arguments: JSON.stringify({ query: "same query" }) }]
  });
  const output = JSON.stringify({
    query: "same query",
    provider: "duckduckgo",
    durationSeconds: 0.1,
    results: [{ title: "One", url: "https://example.com", source: "example.com" }]
  });
  const finished = event("tool-finish:1", NDX_TURN_EVENT.ToolProgress, {
    kind: "tool_finished",
    iteration: 1,
    result: {
      tool: "web_search",
      callId: "search-1",
      status: "success",
      success: true,
      output,
      events: [],
      stdoutText: "",
      stderrText: "",
      startedAt: "2026-05-22T00:00:00.000Z",
      endedAt: "2026-05-22T00:00:00.000Z",
      durationMs: 0
    },
    status: "finished"
  });
  const durable = event("turn.tool.result", NDX_TURN_EVENT.ToolResultRecorded, {
    kind: "tool_result",
    iteration: 1,
    results: [{ toolCallId: "search-1", tool: "web_search", success: true, output }]
  });

  const items = [input, calls, finished, durable].reduce(applyTurnEvent, []).at(-1)?.sidebarItems ?? [];

  assert.equal(items.filter((item) => item.kind === "web_search").length, 1);
});

test("turn reducer only auto-collapses the previous iteration", () => {
  const input = event("turn.input.recorded", NDX_TURN_EVENT.InputRecorded, { text: "inspect files" });
  const first = event("turn.tool.batch:1", NDX_TURN_EVENT.ToolBatchStarted, {
    kind: "tool_call",
    iteration: 1,
    toolCalls: []
  });
  const second = event("turn.tool.batch:2", NDX_TURN_EVENT.ToolBatchStarted, {
    kind: "tool_call",
    iteration: 2,
    toolCalls: []
  });
  const third = event("turn.tool.batch:3", NDX_TURN_EVENT.ToolBatchStarted, {
    kind: "tool_call",
    iteration: 3,
    toolCalls: []
  });

  const firstTwo = [input, first, second].reduce(applyTurnEvent, []);
  const reopenedFirst = firstTwo.map((turn) => ({
    ...turn,
    batches: turn.batches.map((batch) => batch.iteration === 1 ? { ...batch, collapsed: false, manuallyExpanded: true } : batch)
  }));
  const turn = applyTurnEvent(reopenedFirst, third).at(-1);

  assert.deepEqual(turn?.batches.map((batch) => ({
    iteration: batch.iteration,
    collapsed: batch.collapsed,
    manuallyExpanded: batch.manuallyExpanded
  })), [
    { iteration: 1, collapsed: false, manuallyExpanded: true },
    { iteration: 2, collapsed: true, manuallyExpanded: false },
    { iteration: 3, collapsed: false, manuallyExpanded: false }
  ]);
});

test("turn reducer lets interrupt completion override a saved assistant message", () => {
  const input = event("turn.input.recorded", NDX_TURN_EVENT.InputRecorded, { text: "long task" });
  const assistant = event("turn.assistant.recorded", NDX_TURN_EVENT.AssistantRecorded, { kind: "assistant_message", text: "partial answer" });
  const completed = event("turn.interrupt.completed", NDX_TURN_EVENT.InterruptCompleted, { kind: "interrupt_completed", phase: "model_request" });

  const turn = [input, assistant, completed].reduce(applyTurnEvent, []).at(-1);

  assert.equal(turn?.status, "interrupted");
  assert.equal(turn?.collapsed, true);
});

test("turn reducer records model progress notices as iteration events", () => {
  const input = event("turn.input.recorded", NDX_TURN_EVENT.InputRecorded, { kind: "user_message", text: "slow local model" });
  const request = event("turn.model.request", NDX_TURN_EVENT.ModelRequest, { kind: "model_request", iteration: 1, messageCount: 6 });
  const progress = event("turn.model.progress:1", NDX_TURN_EVENT.ModelProgress, {
    kind: "model_progress",
    iteration: 1,
    elapsedMs: 120_000,
    intervalMs: 120_000,
    message: "모델 요청이 120초 동안 진행 중입니다. 더 기다리지 않으려면 세션을 인터럽트하세요."
  });

  const turn = [input, request, progress].reduce(applyTurnEvent, []).at(-1);

  assert.deepEqual(turn?.batches[0]?.modelEvents, [
    "Model request (iteration 1, 6 messages)",
    "모델 요청이 120초 동안 진행 중입니다. 더 기다리지 않으려면 세션을 인터럽트하세요."
  ]);
});

function event(dataid: string, name: NDXSessionEventMessage["event"], contents: NDXSessionEventMessage["contents"]): NDXSessionEventMessage {
  return {
    type: "session.event",
    sessionid: "session-1",
    event: name,
    dataid,
    contents,
    createdat: "2026-05-22T00:00:00.000Z"
  };
}
