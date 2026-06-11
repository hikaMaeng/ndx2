import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { NDX_TURN_EVENT } from "../../common/protocol/index.js";
import { NDX_HOOK_EVENT_NAMES, createNDXHookRuntime, loadNDXHookPlan, registerNDXHook, runNDXHooks, type NDXHookContext, type NDXHookPlan } from "./index.js";
import { runTurnContextPreparedHook, systemHooks as turnContextPreparedHooks } from "./turn.context.prepared/index.js";
import { runTurnEndHook, systemHooks as turnEndHooks } from "./turn.end/index.js";
import { runModelRespondingHook, systemHooks as modelRespondingHooks } from "./turn.model.responding/index.js";
import { runTurnRequestReceivedHook, systemHooks as turnRequestReceivedHooks } from "./turn.request.received/index.js";
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
  projectname: "project-1",
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
    NDX_TURN_EVENT.ModelRequest,
    NDX_TURN_EVENT.ModelResponding,
    NDX_TURN_EVENT.ToolCalled,
    NDX_TURN_EVENT.ToolResultsCollected,
    NDX_TURN_EVENT.TurnEnd
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
    },
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

test("turn context prepared hooks report stable prefix rewrites as diagnostics", async () => {
  const result = await runTurnContextPreparedHook(createNDXHookRuntime({
    [NDX_TURN_EVENT.ContextPrepared]: [{
      kind: "code",
      name: "prefix-breaker",
      source: "system",
      run() {
        return {
          replaceMessages: [
            { role: "system", content: "developer" },
            { role: "user", content: "changed prelude" },
            { role: "user", content: "request" }
          ]
        };
      }
    }]
  }, {}), {
    ...baseContext,
    messages: [
      { role: "system", content: "developer" },
      { role: "user", content: "stable prelude" },
      { role: "user", content: "request" }
    ]
  });

  assert.match(result.result.effect.diagnostics?.join("\n") ?? "", /turn\.context\.prepared hook changed stable model-request prefix/);
});

test("turn context prepared hooks report in-place stable prefix mutation as diagnostics", async () => {
  const result = await runTurnContextPreparedHook(createNDXHookRuntime({
    [NDX_TURN_EVENT.ContextPrepared]: [{
      kind: "code",
      name: "prefix-mutator",
      source: "system",
      run(context) {
        const firstUserMessage = context.messages?.[1];
        if (firstUserMessage && "content" in firstUserMessage) {
          firstUserMessage.content = "mutated prelude";
        }
        return { type: "noeffect" };
      }
    }]
  }, {}), {
    ...baseContext,
    messages: [
      { role: "system", content: "developer" },
      { role: "user", content: "stable prelude" },
      { role: "user", content: "request" }
    ]
  });

  assert.match(result.result.effect.diagnostics?.join("\n") ?? "", /turn\.context\.prepared hook changed stable model-request prefix/);
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

test("turn end system hooks write sessionsearch rows from durable sessiondata ids", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-sessionsearch-hook-"));
  const queries: { text: string; values: unknown[] }[] = [];
  const hookDatabase: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 1 } as never;
    },
    async close() {}
  };
  await runTurnEndHook(createNDXHookRuntime({ [NDX_TURN_EVENT.TurnEnd]: turnEndHooks }, {}), {
    ...baseContext,
    database: hookDatabase,
    userHome,
    input: {
      dataid: "10",
      sessionid: session.sessionid,
      type: "user",
      contents: { kind: "user_message", text: "검색할 사용자 요청" },
      createdat: new Date("2026-05-31T00:00:00.000Z")
    },
    assistant: {
      dataid: "11",
      sessionid: session.sessionid,
      type: "assistant",
      contents: { kind: "assistant_message", text: "검색할 최종 응답" },
      createdat: new Date("2026-05-31T00:00:01.000Z")
    }
  });

  const sessionSearchQueries = queries.filter((query) => /INSERT INTO sessionsearch/.test(query.text));
  assert.equal(sessionSearchQueries.length, 2);
  assert.deepEqual(sessionSearchQueries[0]?.values.slice(0, 5), ["10", session.sessionid, "user", new Date("2026-05-31T00:00:00.000Z"), "검색할 사용자 요청"]);
  assert.deepEqual(sessionSearchQueries[1]?.values.slice(0, 5), ["11", session.sessionid, "assistant", new Date("2026-05-31T00:00:01.000Z"), "검색할 최종 응답"]);
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
    messages: [
      { role: "system", content: `## Skills\n### Available skills\n- demo: demo skill (file: ${skillPath})` },
      { role: "user", content: "hello" }
    ],
    requestText: "[[NDX_SKILL_demo]]로 처리해줘"
  });

  assert.equal(result.effect.replaceRequestText, "$demo로 처리해줘");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "system");
  assert.deepEqual((rows[0].contents as { kind?: unknown; name?: unknown; path?: unknown }).kind, "skill_context");
  assert.deepEqual((rows[0].contents as { name?: unknown; path?: unknown }).name, "demo");
  assert.deepEqual((rows[0].contents as { name?: unknown; path?: unknown }).path, skillPath);
  const text = String((rows[0].contents as { text?: unknown }).text ?? "");
  assert.match(text, /<selected_skill_instruction>/);
  assert.match(text, /explicitly selected `\$demo`/);
  assert.match(text, /You must apply this skill's workflow/);
  assert.match(text, /Do not call `loadSkill` for this skill again/);
  assert.match(text, /<skill>\n<name>demo<\/name>/);
  assert.match(text, /Use demo workflow\./);
});

test("request received system hook strips thinking marker from the current user request", async () => {
  const result = await runNDXHooks(createNDXHookRuntime({ [NDX_TURN_EVENT.RequestReceived]: turnRequestReceivedHooks }, {}), NDX_TURN_EVENT.RequestReceived, {
    ...baseContext,
    requestText: "[[NDX_THINKING_low]]\n수정하고 배포해"
  });

  assert.equal(result.effect.replaceRequestText, "수정하고 배포해");
  assert.doesNotMatch(result.effect.replaceRequestText ?? "", /NDX_THINKING/);
});

test("request received thinking marker strips legacy none marker", async () => {
  const result = await runNDXHooks(createNDXHookRuntime({ [NDX_TURN_EVENT.RequestReceived]: turnRequestReceivedHooks }, {}), NDX_TURN_EVENT.RequestReceived, {
    ...baseContext,
    requestText: "[[NDX_THINKING_none]]\n확인해"
  });

  assert.equal(result.effect.replaceRequestText, "확인해");
});

test("request received thinking marker strips medium and high markers without injecting guidance", async () => {
  const medium = await runNDXHooks(createNDXHookRuntime({ [NDX_TURN_EVENT.RequestReceived]: turnRequestReceivedHooks }, {}), NDX_TURN_EVENT.RequestReceived, {
    ...baseContext,
    requestText: "[[NDX_THINKING_medium]]\n확인해"
  });
  const high = await runNDXHooks(createNDXHookRuntime({ [NDX_TURN_EVENT.RequestReceived]: turnRequestReceivedHooks }, {}), NDX_TURN_EVENT.RequestReceived, {
    ...baseContext,
    requestText: "[[NDX_THINKING_high]]\n확인해"
  });

  assert.equal(medium.effect.replaceRequestText, "확인해");
  assert.equal(high.effect.replaceRequestText, "확인해");
});

test("request received system hook applies thinking and skill markers together", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-hook-thinking-skill-"));
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
    messages: [
      { role: "system", content: `## Skills\n### Available skills\n- demo: demo skill (file: ${skillPath})` },
      { role: "user", content: "hello" }
    ],
    requestText: "[[NDX_THINKING_low]] [[NDX_SKILL_demo]]로 처리해줘"
  });

  assert.equal(result.effect.replaceRequestText, "$demo로 처리해줘");
  assert.doesNotMatch(result.effect.replaceRequestText ?? "", /NDX_THINKING|NDX_SKILL/);
  assert.equal(rows.length, 1);
  assert.deepEqual((rows[0].contents as { kind?: unknown }).kind, "skill_context");
});

test("request received system hook appends a selected instruction when the skill is already present in model context", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-hook-skill-loaded-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  const skillPath = path.join(projectHome, ".ndx", "skills", "demo", "SKILL.md");
  const rows: Array<{ dataid: string; sessionid: string; type: string; contents: unknown; createdat: Date }> = [];
  await fs.mkdir(path.dirname(skillPath), { recursive: true });
  await fs.writeFile(skillPath, "---\nname: demo\ndescription: demo skill\n---\nUse demo workflow.\n", "utf8");

  const database: NDXDatabase = {
    async query(text, values) {
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

  const loadedSkill = `<skill>\n<name>demo</name>\n<path>${skillPath}</path>\nUse demo workflow.\n</skill>`;
  const result = await runNDXHooks(createNDXHookRuntime({ [NDX_TURN_EVENT.RequestReceived]: turnRequestReceivedHooks }, {}), NDX_TURN_EVENT.RequestReceived, {
    ...baseContext,
    database,
    userHome,
    projectHome,
    messages: [
      { role: "system", content: `## Skills\n### Available skills\n- demo: demo skill (file: ${skillPath})` },
      { role: "user", content: "hello" },
      { role: "user", content: loadedSkill }
    ],
    requestText: "[[NDX_SKILL_demo]] 다시 써줘"
  });

  assert.equal(result.effect.replaceRequestText, "$demo 다시 써줘");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "system");
  assert.deepEqual((rows[0].contents as { kind?: unknown; name?: unknown; path?: unknown }).kind, "skill_context");
  assert.deepEqual((rows[0].contents as { name?: unknown; path?: unknown }).name, "demo");
  assert.deepEqual((rows[0].contents as { name?: unknown; path?: unknown }).path, skillPath);
  const text = String((rows[0].contents as { text?: unknown }).text ?? "");
  assert.match(text, /<selected_skill_instruction>/);
  assert.match(text, /The full <skill> block for this skill is already present earlier/);
  assert.doesNotMatch(text, /Use demo workflow\./);
  assert.doesNotMatch(text, /<skill>\n<name>demo<\/name>/);
});

test("request received system hook appends a corrected skill only once per request", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-hook-skill-dedupe-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  const skillPath = path.join(projectHome, ".ndx", "skills", "web-service-scaffold", "SKILL.md");
  const rows: Array<{ dataid: string; sessionid: string; type: string; contents: unknown; createdat: Date }> = [];
  await fs.mkdir(path.dirname(skillPath), { recursive: true });
  await fs.writeFile(skillPath, "---\nname: web-service-scaffold\ndescription: web scaffold\n---\nUse scaffold workflow.\n", "utf8");

  const database: NDXDatabase = {
    async query(text, values) {
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
    messages: [
      { role: "system", content: `## Skills\n### Available skills\n- web-service-scaffold: web scaffold (file: ${skillPath})` },
      { role: "user", content: "hello" }
    ],
    requestText: "[[NDX_SKILL_web-service-scaffold]] [[NDX_SKILL_web%20service%20scaffold]] 처리해줘"
  });

  assert.equal(result.effect.replaceRequestText, "$web-service-scaffold $web service scaffold 처리해줘");
  assert.equal(rows.length, 1);
  assert.deepEqual((rows[0].contents as { kind?: unknown; name?: unknown; path?: unknown }).kind, "skill_context");
  assert.deepEqual((rows[0].contents as { name?: unknown; path?: unknown }).name, "web-service-scaffold");
  assert.deepEqual((rows[0].contents as { name?: unknown; path?: unknown }).path, skillPath);
});

test("context prepared system hook inlines image attachments for selected session data ids", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-hook-image-"));
  const imagePath = path.join(root, "sample.png");
  await fs.writeFile(imagePath, Buffer.from([1, 2, 3]));
  const input = {
    dataid: "input-1",
    sessionid: session.sessionid,
    type: "user",
    createdat: new Date(0),
    contents: {
      kind: "user_message",
      text: "이미지를 봐",
      attachments: [{ kind: "image", path: imagePath, name: "sample.png", mimeType: "image/png", size: 3 }]
    }
  };
  const messages = [
    { role: "system", content: "developer" },
    {
      role: "user",
      content: [
        { type: "input_text", text: "이미지를 봐" },
        { type: "input_image", file_path: imagePath, mime_type: "image/png" }
      ]
    }
  ];
  let consumeCount = 0;
  const runtimeDatabase: NDXDatabase = {
    async query(text) {
      if (/runtimedata/.test(text)) {
        consumeCount += 1;
        return { rows: [{ ids: consumeCount === 1 ? ["input-1"] : [] }], rowCount: 1, command: "", oid: 0, fields: [] } as never;
      }
      return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] } as never;
    },
    async close() {}
  };

  try {
    const first = await runTurnContextPreparedHook(createNDXHookRuntime({ [NDX_TURN_EVENT.ContextPrepared]: turnContextPreparedHooks }, {}), {
      ...baseContext,
      database: runtimeDatabase,
      input,
      iteration: 1,
      sessionDataRows: [input],
      messages
    });
    const firstText = JSON.stringify(first.messages);
    assert.match(firstText, /data:image\/png;base64,AQID/);
    assert.doesNotMatch(firstText, /file_path/);
    assert.doesNotMatch(firstText, new RegExp(imagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const second = await runTurnContextPreparedHook(createNDXHookRuntime({ [NDX_TURN_EVENT.ContextPrepared]: turnContextPreparedHooks }, {}), {
      ...baseContext,
      database: runtimeDatabase,
      input,
      iteration: 2,
      sessionDataRows: [input],
      messages
    });
    assert.deepEqual(second.messages, messages);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("context prepared system hook appends cot_work reminder only from the current turn", async () => {
  const input = {
    dataid: "10",
    sessionid: session.sessionid,
    type: "user",
    createdat: new Date("2026-05-12T00:00:10.000Z"),
    contents: { kind: "user_message", text: "do work" }
  };
  const previousTurnCotWork = {
    dataid: "8",
    sessionid: session.sessionid,
    type: "assistant",
    createdat: new Date("2026-05-12T00:00:08.000Z"),
    contents: { kind: "cot_work", steps: [{ task: "Old work", status: "in_progress" }] }
  };
  const currentTurnCotWork = {
    dataid: "12",
    sessionid: session.sessionid,
    type: "assistant",
    createdat: new Date("2026-05-12T00:00:12.000Z"),
    contents: { kind: "cot_work", steps: [{ task: "Inspect current files", status: "completed" }, { task: "Patch current code", status: "in_progress" }] }
  };
  const appended: unknown[] = [];
  const runtimeDatabase: NDXDatabase = {
    async query(text, values) {
      if (/INSERT INTO sessiondata/i.test(text)) {
        appended.push(JSON.parse(String(values?.[2])));
        return {
          rows: [{ dataid: "13", sessionid: values?.[0], type: values?.[1], contents: JSON.parse(String(values?.[2])), createdat: new Date("2026-05-12T00:00:13.000Z") }],
          rowCount: 1,
          command: "",
          oid: 0,
          fields: []
        } as never;
      }
      return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] } as never;
    },
    async close() {}
  };

  const result = await runTurnContextPreparedHook(createNDXHookRuntime({ [NDX_TURN_EVENT.ContextPrepared]: turnContextPreparedHooks }, {}), {
    ...baseContext,
    database: runtimeDatabase,
    input,
    iteration: 2,
    sessionDataRows: [previousTurnCotWork, input, currentTurnCotWork],
    messages: [{ role: "user", content: "do work" }]
  });

  assert.equal(appended.length, 1);
  assert.deepEqual(appended[0], {
    kind: "cot_work_reminder",
    iteration: 2,
    sourceDataId: "12",
    text: [
      "cot_work reminder: Continue from the active plan below.",
      "Before doing more work, update cot_work if any step is completed, blocked, stale, or needs to change.",
      "1. [completed] Inspect current files",
      "2. [in_progress] Patch current code"
    ].join("\n")
  });
  assert.equal(result.messages.at(-1)?.role, "user");
  assert.match(JSON.stringify(result.messages.at(-1)), /Patch current code/);
  assert.doesNotMatch(JSON.stringify(result.messages), /Old work/);
});

test("compact context limit system hooks return compact effects instead of direct turn-loop decisions", async () => {
  const usageDatabase: NDXDatabase = {
    async query(text) {
      if (/FROM turncontextusage/i.test(text)) {
        return {
          rows: [{ turncount: "5", tokens: "10000", avgtokens: "2000" }],
          rowCount: 1,
          command: "",
          oid: 0,
          fields: []
        } as never;
      }
      return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] } as never;
    },
    async close() {}
  };
  const sessionDataRows = [{
    dataid: "1",
    sessionid: session.sessionid,
    type: "user",
    contents: { kind: "user_message", text: "older request" },
    createdat: new Date(0)
  }];
  const contextUsage = {
    tokens: 940,
    contextsize: 1000,
    percent: 94,
    remainingTokens: 60,
    developerTokens: 0,
    userPreludeTokens: 0,
    historyTokens: 940,
    messageTokens: 940,
    toolDefinitionTokens: 0,
    inFlightTokens: 0
  };

  const requestCompact = await runTurnRequestReceivedHook(createNDXHookRuntime({ [NDX_TURN_EVENT.RequestReceived]: turnRequestReceivedHooks }, {}), {
    ...baseContext,
    database: usageDatabase,
    sessionDataRows,
    contextUsage
  });
  const contextCompact = await runTurnContextPreparedHook(createNDXHookRuntime({ [NDX_TURN_EVENT.ContextPrepared]: turnContextPreparedHooks }, {}), {
    ...baseContext,
    database: usageDatabase,
    sessionDataRows,
    contextUsage
  });

  assert.equal(requestCompact.compact?.endTurn, false);
  assert.equal(requestCompact.compact?.report.phase, "turn_start");
  assert.equal(contextCompact.compact?.endTurn, true);
  assert.equal(contextCompact.compact?.report.phase, "iteration");
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

test("model responding stream guard allows extended local-model reasoning before output", async () => {
  const result = await runModelRespondingHook(createNDXHookRuntime({ [NDX_TURN_EVENT.ModelResponding]: modelRespondingHooks }, {}), {
    ...baseContext,
    iteration: 1,
    modelResponse: {
      type: "reasoning",
      summary: "r".repeat(30_000),
      content: "",
      elapsedMs: 1_000,
      sequence: 1
    }
  });

  assert.equal(result.interruptModelResponse, false);
});

test("model responding stream guard uses configured max reasoning length before fallback", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-hook-stream-guard-configured-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ hooks: { StreamGuard: { MAX_REASONING_LENGTH: 10 } } }), "utf8");

  try {
    const result = await runModelRespondingHook(createNDXHookRuntime({ [NDX_TURN_EVENT.ModelResponding]: modelRespondingHooks }, {}), {
      ...baseContext,
      userHome,
      iteration: 101,
      modelResponse: {
        type: "reasoning",
        summary: "r".repeat(11),
        content: "",
        elapsedMs: 1_000,
        sequence: 1
      }
    });

    assert.equal(result.interruptModelResponse, true);
    assert.match(result.interruptReason ?? "", /exceeded 10 characters/);
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
      const requestBody = JSON.parse(body) as { input?: string | Array<{ role: string; content: Array<{ text?: string }> }> };
      const userContent = typeof requestBody.input === "string"
        ? requestBody.input.split("\n\nuser:\n").at(-1) ?? "{}"
        : requestBody.input?.find((message) => message.role === "user")?.content.map((part) => part.text ?? "").join("") ?? "{}";
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
