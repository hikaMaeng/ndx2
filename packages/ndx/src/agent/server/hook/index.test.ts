import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { NDX_TURN_EVENT } from "../../common/protocol/index.js";
import { NDX_HOOK_EVENT_NAMES, createNDXHookRuntime, loadNDXHookPlan, registerNDXHook, runNDXHooks, type NDXHookContext, type NDXHookPlan } from "./index.js";
import { systemHooks as turnRequestReceivedHooks } from "./turn.request.received/index.js";
import { runToolResultsCollectedHook, systemHooks as toolResultsCollectedHooks } from "./turn.tool.results.collected/index.js";
import type { NDXDatabase, NDXSessionRow } from "../session/types.js";

const database: NDXDatabase = {
  async query() {
    return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] };
  },
  async close() {}
};

const session: NDXSessionRow = {
  sessionid: "session-1",
  userid: "ndev",
  title: "title",
  lastupdated: new Date(0),
  mode: "none",
  path: "/workspace",
  projectid: "project-1",
  model: {
    type: "openai",
    model: "test-model",
    url: "http://model",
    token: "token",
    contextsize: 1000
  },
  isrunning: true,
  turnphase: "context",
  interruptrequested: false,
  interruptrequestedat: null,
  interruptcompletedat: null
};

const baseContext: Omit<NDXHookContext, "event"> = {
  database,
  session,
  requestText: "hello",
  userHome: "/home/ndx",
  projectHome: "/workspace",
  messages: [{ role: "user", content: "hello" }]
};

test("hook event surface exposes only durable turn interception points", () => {
  assert.deepEqual([...NDX_HOOK_EVENT_NAMES], [
    NDX_TURN_EVENT.RequestReceived,
    NDX_TURN_EVENT.ContextPrepared,
    NDX_TURN_EVENT.ModelResponding,
    NDX_TURN_EVENT.ToolCalled,
    NDX_TURN_EVENT.ToolResultsCollected,
    NDX_TURN_EVENT.ResponsePrepared
  ]);
});

test("hook runtime executes event plan sequentially and passes prior effects to the next executor", async () => {
  const calls: number[] = [];
  const plan: NDXHookPlan = {};

  registerNDXHook(plan, NDX_TURN_EVENT.ContextPrepared, {
    kind: "code",
    name: "first",
    source: "system",
    run(context) {
      calls.push(context.messages?.length ?? 0);
      return { appendMessages: [{ role: "system", content: "first note" }] };
    }
  });
  registerNDXHook(plan, NDX_TURN_EVENT.ContextPrepared, {
    kind: "code",
    name: "second",
    source: "system",
    run(context) {
      calls.push(context.messages?.length ?? 0);
      return { appendMessages: [{ role: "system", content: "second note" }] };
    }
  });

  const result = await runNDXHooks(createNDXHookRuntime(plan, {}), NDX_TURN_EVENT.ContextPrepared, baseContext);

  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(result.effect.appendMessages, [
    { role: "system", content: "first note" },
    { role: "system", content: "second note" }
  ]);
});

test("stopturn effect stops later executors in the same event plan", async () => {
  const calls: string[] = [];
  const plan: NDXHookPlan = {};

  registerNDXHook(plan, NDX_TURN_EVENT.ToolResultsCollected, {
    kind: "code",
    name: "stop",
    source: "system",
    run() {
      calls.push("stop");
      return { type: "stopturn", finalAssistantText: "stopped by hook" };
    }
  });
  registerNDXHook(plan, NDX_TURN_EVENT.ToolResultsCollected, {
    kind: "code",
    name: "after",
    source: "system",
    run() {
      calls.push("after");
      return { type: "noeffect" };
    }
  });

  const result = await runNDXHooks(createNDXHookRuntime(plan, {}), NDX_TURN_EVENT.ToolResultsCollected, baseContext);

  assert.deepEqual(calls, ["stop"]);
  assert.equal(result.effect.type, "stopturn");
  assert.equal(result.effect.finalAssistantText, "stopped by hook");
});

test("loadNDXHookPlan appends global, plugin, project, and project-plugin process hooks in priority order", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-hook-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await writeHook(path.join(userHome, ".ndx", "hook", "hook.json"), "global", 0);
  await writeHook(path.join(userHome, ".ndx", "plugins", "zeta", "hook", "hook.json"), "user-zeta", -1);
  await writeHook(path.join(userHome, ".ndx", "plugins", "alpha", "hook", "hook.json"), "user-alpha", 1);
  await writeHook(path.join(userHome, ".ndx", "plugins", "beta", "hook", "hook.json"), "user-beta", 1);
  await writeHook(path.join(projectHome, ".ndx", "hook", "hook.json"), "project", 0);
  await writeHook(path.join(projectHome, ".ndx", "plugins", "local", "hook", "hook.json"), "project-plugin", 0);

  const plan = await loadNDXHookPlan({ userHome, projectHome });

  assert.deepEqual(plan[NDX_TURN_EVENT.ContextPrepared]?.map((hook) => hook.name), [
    "global",
    "user-zeta",
    "user-alpha",
    "user-beta",
    "project",
    "project-plugin"
  ]);
});

test("user hook executors run as spawned processes and return hook effects", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-hook-process-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  const hookDir = path.join(projectHome, ".ndx", "hook");
  await fs.mkdir(hookDir, { recursive: true });
  await fs.writeFile(
    path.join(hookDir, "hook.mjs"),
    "process.stdin.resume();process.stdin.on('data',()=>{});process.stdin.on('end',()=>console.log(JSON.stringify({type:'result',success:true,output:{type:'stopturn',finalAssistantText:'from process'}})));",
    "utf8"
  );
  await fs.writeFile(
    path.join(hookDir, "hook.json"),
    JSON.stringify({
      [NDX_TURN_EVENT.ContextPrepared]: [
        {
          name: "project-process",
          tool: {
            command: "node",
            args: ["./hook.mjs"]
          }
        }
      ]
    }),
    "utf8"
  );
  const runtime = createNDXHookRuntime({}, await loadNDXHookPlan({ userHome, projectHome }));
  const result = await runNDXHooks(runtime, NDX_TURN_EVENT.ContextPrepared, {
    ...baseContext,
    userHome,
    projectHome
  });

  assert.equal(result.executions[0]?.processResult?.success, true);
  assert.equal(result.effect.type, "stopturn");
  assert.equal(result.effect.finalAssistantText, "from process");
});

test("request received system hook records selected skill contents before rewriting the request text", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-hook-skill-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  const skillPath = path.join(projectHome, ".ndx", "skills", "demo", "SKILL.md");
  const rows: Array<{ dataid: string; sessionid: string; type: string; contents: unknown; createdat: Date }> = [];
  await fs.mkdir(path.dirname(skillPath), { recursive: true });
  await fs.writeFile(skillPath, "---\nname: demo\ndescription: demo skill\n---\nUse demo workflow.\n", "utf8");

  const database: NDXDatabase = {
    async query(text, values) {
      if (/SELECT dataid, sessionid, type, contents, createdat\s+FROM sessiondata/i.test(text)) {
        return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] } as never;
      }
      if (/INSERT INTO sessiondata/i.test(text)) {
        const row = {
          dataid: String(rows.length + 1),
          sessionid: String(values?.[0]),
          type: String(values?.[1]),
          contents: JSON.parse(String(values?.[2])),
          createdat: new Date(0)
        };
        rows.push(row);
        return { rows: [row], rowCount: 1, command: "", oid: 0, fields: [] } as never;
      }
      return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] } as never;
    },
    async close() {}
  };

  const result = await runNDXHooks(createNDXHookRuntime({ [NDX_TURN_EVENT.RequestReceived]: turnRequestReceivedHooks }, {}), NDX_TURN_EVENT.RequestReceived, {
    ...baseContext,
    database,
    userHome,
    projectHome,
    requestText: "[[NDX_SKILL_demo]]로 처리해줘"
  });

  assert.equal(result.effect.replaceRequestText, "$demo로 처리해줘");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "assistant");
  assert.match(JSON.stringify(rows[0].contents), /<name>demo<\/name>/);
  assert.match(JSON.stringify(rows[0].contents), /Use demo workflow\./);
});

test("tool results system loop detection is disabled when interval is non-positive", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-hook-loop-disabled-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ runtime: { loopDetectionInterval: 0 } }), "utf8");
  let queryCount = 0;
  const database: NDXDatabase = {
    async query() {
      queryCount += 1;
      return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] };
    },
    async close() {}
  };

  try {
    const result = await runToolResultsCollectedHook(createNDXHookRuntime({ [NDX_TURN_EVENT.ToolResultsCollected]: toolResultsCollectedHooks }, {}), {
      ...baseContext,
      database,
      userHome,
      iteration: 50,
      toolResults: []
    });

    assert.equal(result.stopTurn, false);
    assert.equal(queryCount, 0);
  } finally {
    await fs.rm(userHome, { recursive: true, force: true });
  }
});

test("tool results system loop detection stops the turn from model judgment on configured interval", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-hook-loop-stop-"));
  const projectHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-hook-loop-project-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ runtime: { loopDetectionInterval: 2 } }), "utf8");
  const rows = [
    {
      dataid: "1",
      sessionid: session.sessionid,
      type: "user",
      contents: { kind: "user_message", text: "고쳐줘" },
      createdat: new Date("2026-05-22T00:00:00.000Z")
    },
    {
      dataid: "2",
      sessionid: session.sessionid,
      type: "tool_call",
      contents: { kind: "tool_call", iteration: 1, toolCalls: [{ name: "old", arguments: "{}" }] },
      createdat: new Date("2026-05-22T00:00:01.000Z")
    },
    {
      dataid: "3",
      sessionid: session.sessionid,
      type: "tool_call",
      contents: { kind: "tool_call", iteration: 3, toolCalls: [{ name: "exec", arguments: "{\"step\":3}" }] },
      createdat: new Date("2026-05-22T00:00:02.000Z")
    },
    {
      dataid: "4",
      sessionid: session.sessionid,
      type: "assistant",
      contents: { kind: "tool_result", iteration: 4, results: [{ toolCallId: "call-1", tool: "exec", success: false, output: "same failure" }] },
      createdat: new Date("2026-05-22T00:00:03.000Z")
    }
  ];
  let modelRequestCount = 0;
  let loopDetectionPayload: {
    currentIteration?: { iteration?: unknown; toolResults?: Array<{ tool?: string; success?: boolean; output?: string }> };
    iterationWindow?: { startIteration?: unknown; endIteration?: unknown; size?: unknown; iterationCount?: unknown; iterations?: unknown[] };
  } | undefined;
  const modelServer = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      modelRequestCount += 1;
      const requestBody = JSON.parse(body) as { input?: Array<{ role: string; content: Array<{ text?: string }> }> };
      const userContent = requestBody.input?.find((message) => message.role === "user")?.content.map((part) => part.text ?? "").join("") ?? "{}";
      loopDetectionPayload = JSON.parse(userContent) as typeof loopDetectionPayload;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              shouldStop: true,
              reason: "같은 도구 실패가 반복됩니다.",
              finalAssistantText: "반복 루프가 감지되어 중단했습니다."
            })
          }]
        }]
      }));
    });
  });
  await new Promise<void>((resolve) => {
    modelServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = modelServer.address();
  assert(address && typeof address === "object");
  const database: NDXDatabase = {
    async query(text) {
      if (/FROM sessiondata/i.test(text)) {
        return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] } as never;
      }
      return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] } as never;
    },
    async close() {}
  };

  try {
    const result = await runToolResultsCollectedHook(createNDXHookRuntime({ [NDX_TURN_EVENT.ToolResultsCollected]: toolResultsCollectedHooks }, {}), {
      ...baseContext,
      database,
      session: {
        ...session,
        model: {
          ...session.model,
          url: `http://127.0.0.1:${address.port}/v1`
        }
      },
      userHome,
      projectHome,
      iteration: 4,
      toolCalls: [{ name: "exec", arguments: "{}" }],
      toolResults: [{
        tool: "exec",
        callId: "call-1",
        status: "failed",
        success: false,
        output: "same failure",
        events: [],
        stdoutText: "",
        stderrText: "same failure",
        startedAt: "2026-05-22T00:00:00.000Z",
        endedAt: "2026-05-22T00:00:01.000Z",
        durationMs: 1000
      }]
    });

    assert.equal(modelRequestCount, 1);
    assert.deepEqual(loopDetectionPayload?.currentIteration, {
      iteration: 4,
      toolCalls: [{ name: "exec", arguments: "{}" }],
      toolResults: [{
        tool: "exec",
        callId: "call-1",
        success: false,
        status: "failed",
        output: "same failure"
      }]
    });
    assert.deepEqual(loopDetectionPayload?.iterationWindow, {
      startIteration: 3,
      endIteration: 4,
      size: 2,
      iterationCount: 2,
      iterations: [
        {
          iteration: 3,
          isCurrent: false,
          rows: [{
            dataid: "3",
            type: "tool_call",
            createdat: "2026-05-22T00:00:02.000Z",
            text: "exec({\"step\":3})"
          }]
        },
        {
          iteration: 4,
          isCurrent: true,
          rows: [{
            dataid: "4",
            type: "assistant",
            createdat: "2026-05-22T00:00:03.000Z",
            text: "exec(call-1) failed:\nsame failure"
          }]
        }
      ]
    });
    assert.equal(result.stopTurn, true);
    assert.equal(result.finalAssistantText, "반복 루프가 감지되어 중단했습니다.");
  } finally {
    modelServer.close();
    await once(modelServer, "close");
    await fs.rm(userHome, { recursive: true, force: true });
    await fs.rm(projectHome, { recursive: true, force: true });
  }
});

async function writeHook(filePath: string, name: string, priority: number): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify({
      priority,
      [NDX_TURN_EVENT.ContextPrepared]: [
        {
          name,
          tool: {
            command: "node",
            args: ["-e", "console.log(JSON.stringify({type:'result',success:true,output:{type:'noeffect'}}))"]
          }
        }
      ]
    }),
    "utf8"
  );
}
