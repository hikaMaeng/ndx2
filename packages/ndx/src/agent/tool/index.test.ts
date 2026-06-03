import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NDX_COT_WORK_CONTENT_KIND } from "../../common/protocol/index.js";
import { executeToolCalls, listAvailableTools, toolSchemas } from "./index.js";
import { createCotWorkAgentCallHandler } from "./base/cot_work/agentCall.js";
import { NDX_SIDEBAR_ITEM_AGENTCALL_NAME } from "./execute/agentcall/index.js";
import type { NDXToolExecutionOptions, NDXToolExecutionResult } from "./index.js";

test("listAvailableTools merges external tools before builtin tools with builtin names protected", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await writeTool(path.join(userHome, ".ndx", "tools", "bash"), "bash", "user external");
  await writeTool(path.join(projectHome, ".ndx", "tools", "now"), "now", "project external");

  const tools = await listAvailableTools({ userHome, projectHome });
  const bash = tools.find((tool) => tool.name === "bash");
  const now = tools.find((tool) => tool.name === "now");

  assert.equal(bash?.source, "builtin");
  assert.equal(now?.source, "project");
  assert.ok(toolSchemas(tools).some((schema) => schema.name === "now"));
});

test("listAvailableTools rejects arg templates not declared in schema properties", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "bad"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "bad", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["-e", "process.exit(0)", "{arguments}"] },
      schema: { type: "function", name: "bad", parameters: { type: "object", properties: { value: { type: "string" } } } }
    }),
    "utf8"
  );

  await assert.rejects(
    () => listAvailableTools({ userHome, projectHome }),
    /tool arg template \{arguments\} is not declared in schema properties/
  );
});

test("listAvailableTools rejects unknown runtime arg templates", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "bad_runtime"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "bad_runtime", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["-e", "process.exit(0)", "$UNKNOWN_RUNTIME"] },
      schema: { type: "function", name: "bad_runtime", parameters: { type: "object", properties: {} } }
    }),
    "utf8"
  );

  await assert.rejects(
    () => listAvailableTools({ userHome, projectHome }),
    /unknown tool runtime template \$UNKNOWN_RUNTIME/
  );
});

test("listAvailableTools accepts known runtime arg templates", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "runtime"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "runtime", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["-e", "process.exit(0)", "$SKILL_LIST", "$LOADED_SKILL"] },
      schema: { type: "function", name: "runtime", parameters: { type: "object", properties: {} } }
    }),
    "utf8"
  );

  const tools = await listAvailableTools({ userHome, projectHome });

  assert.ok(tools.some((tool) => tool.name === "runtime"));
});

test("runtime arg resolution only loads the template a tool actually uses", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await fs.mkdir(path.join(projectHome, ".ndx", "skills", "broken"), { recursive: true });
  await fs.writeFile(path.join(projectHome, ".ndx", "skills", "broken", "SKILL.md"), "---\nname: broken\ndescription: broken\n---\n", "utf8");
  await fs.writeFile(path.join(projectHome, ".ndx", "skills", "broken", ".cache"), "{not-json", "utf8");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "loaded_only"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "loaded_only", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["./index.mjs", "$LOADED_SKILL"] },
      schema: { type: "function", name: "loaded_only", parameters: { type: "object", properties: {} } }
    }),
    "utf8"
  );
  await fs.writeFile(path.join(userHome, ".ndx", "tools", "loaded_only", "index.mjs"), "process.stdout.write(process.argv[2] || '')\n", "utf8");

  const result = await executeToolCall(
    { call_id: "runtime_lazy_1", name: "loaded_only", arguments: "{}" },
    {
      userHome,
      projectHome,
      turnContext: {
        developer: { role: "system", content: "" },
        user: { role: "user", content: "" },
        history: [{ role: "assistant", content: "<skill>\n<name>demo</name>\n<path>/tmp/demo/SKILL.md</path>\n</skill>" }]
      }
    }
  );

  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(result.output), { names: ["demo"], paths: ["/tmp/demo/SKILL.md"] });
});

test("skill list runtime arg is supplied from turn context", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  const skillPath = path.join(projectHome, ".ndx", "skills", "demo", "SKILL.md");
  await fs.mkdir(path.dirname(skillPath), { recursive: true });
  await fs.writeFile(skillPath, "---\nname: demo\ndescription: demo skill\n---\n", "utf8");
  await fs.writeFile(path.join(path.dirname(skillPath), ".cache"), "{not-json", "utf8");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "skill_list_only"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "skill_list_only", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["./index.mjs", "$SKILL_LIST"] },
      schema: { type: "function", name: "skill_list_only", parameters: { type: "object", properties: {} } }
    }),
    "utf8"
  );
  await fs.writeFile(path.join(userHome, ".ndx", "tools", "skill_list_only", "index.mjs"), "process.stdout.write(process.argv[2] || '')\n", "utf8");

  const result = await executeToolCall(
    { call_id: "runtime_skill_list_1", name: "skill_list_only", arguments: "{}" },
    { userHome, projectHome, turnContext: skillTurnContext("demo", "demo skill", skillPath) }
  );

  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(result.output), [{
    name: "demo",
    description: "demo skill",
    path: skillPath
  }]);
});

test("skill list runtime arg expands aliases from turn context", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  const skillRoot = path.join(projectHome, ".ndx", "skills");
  const skillPath = path.join(skillRoot, "demo", "SKILL.md");
  await fs.mkdir(path.dirname(skillPath), { recursive: true });
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "skill_list_alias"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "skill_list_alias", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["./index.mjs", "$SKILL_LIST"] },
      schema: { type: "function", name: "skill_list_alias", parameters: { type: "object", properties: {} } }
    }),
    "utf8"
  );
  await fs.writeFile(path.join(userHome, ".ndx", "tools", "skill_list_alias", "index.mjs"), "process.stdout.write(process.argv[2] || '')\n", "utf8");

  const result = await executeToolCall(
    { call_id: "runtime_skill_list_alias_1", name: "skill_list_alias", arguments: "{}" },
    {
      userHome,
      projectHome,
      turnContext: {
        developer: {
          role: "system" as const,
          content: `<available_skills_instructions>\n### Skill roots\n- \`r0\` = \`${skillRoot}\`\n### Available skills\n- demo: demo skill (file: r0/demo/SKILL.md)\n</available_skills_instructions>`
        },
        user: { role: "user" as const, content: "" },
        history: []
      }
    }
  );

  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(result.output), [{ name: "demo", description: "demo skill", path: skillPath }]);
});

test("all builtin tool arg templates resolve against their own schema properties", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const tools = await listAvailableTools({ userHome: path.join(root, "user"), projectHome: path.join(root, "project") });

  assert.deepEqual(tools.map((tool) => tool.name), ["askUserQuestion", "bash", "cot_work", "edit", "getImage", "glob", "grep_search", "loadSkill", "prompt_rewrite", "read_file", "session_history", "web_fetch", "web_search", "write_file"]);
  assert.ok(tools.every((tool) => tool.source === "builtin"));
});

test("session_history function tool returns structured history search results", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-history-tool-"));
  const queries: { text: string; values: unknown[] }[] = [];
  const result = await executeToolCall(
    { call_id: "history_1", name: "session_history", arguments: JSON.stringify({ scope: "session", query: "이전 결정", limit: 3 }) },
    {
      userHome,
      sessionid: "018f0000-0000-7000-8000-000000000000",
      session: {
        sessionid: "018f0000-0000-7000-8000-000000000000",
        userid: "ndev",
        title: "",
        lastupdated: new Date(),
        mode: "none",
        path: "/repo",
        projectname: "018f0000-0000-7000-8000-000000000001",
        model: { type: "openai", model: "test", url: "https://example.test", token: "", contextsize: 1000 },
        isrunning: true,
        turnphase: "model_request",
        interruptrequested: false,
        interruptrequestedat: null,
        interruptcompletedat: null
      },
      database: {
        async query(text, values) {
          queries.push({ text, values: values ?? [] });
          return {
            rows: [{
              dataid: "4",
              sessionid: "018f0000-0000-7000-8000-000000000000",
              type: "user",
              createdat: new Date("2026-05-31T00:00:00.000Z"),
              text: "이전 결정 본문",
              tokenlength: 3,
              rank: 0.3
            }],
            rowCount: 1
          } as never;
        },
        async close() {}
      }
    }
  );

  assert.equal(result.success, true);
  const output = JSON.parse(result.output) as { mode: string; results: Array<{ text: string; score?: { rank?: number } }> };
  assert.equal(output.mode, "fts");
  assert.equal(output.results[0].text, "이전 결정 본문");
  assert.equal(output.results[0].score?.rank, 0.3);
  assert.match(queries[0].text, /WHERE ss\.sessionid = \$1::uuid/);
  assert.deepEqual(queries[0].values, ["018f0000-0000-7000-8000-000000000000", "이전 결정", 3]);
});

test("tool registry can filter tools by session allowlist", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const tools = await listAvailableTools({
    userHome: path.join(root, "user"),
    projectHome: path.join(root, "project"),
    allowedToolNames: ["cot_work", "read_file", "web_search"]
  });

  assert.deepEqual(tools.map((tool) => tool.name), ["cot_work", "read_file", "web_search"]);
});

test("tool execution rejects calls outside the session allowlist before process spawn", async () => {
  const result = await executeToolCall(
    { call_id: "deny_bash_1", name: "bash", arguments: "{\"command\":\"pwd\"}" },
    { allowedToolNames: ["read_file"] }
  );

  assert.equal(result.success, false);
  assert.match(result.output, /Tool is not allowed in this session: bash/);
});

test("cot_work emits a live agent call and returns a compact tool result", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-cot-work-tool-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  const cotWorkMessages: unknown[] = [];

  const result = await executeToolCall(
    {
      call_id: "cot_1",
      name: "cot_work",
      arguments: JSON.stringify({
        steps: [
          { task: "Read context", status: "completed" },
          { task: "Apply patch", status: "in_progress" },
          { task: "Run checks", status: "pending" }
        ],
        reason: "scope changed"
      })
    },
    {
      userHome,
      projectHome,
      agentCallHandlers: {
        "session.cot_work": (input) => {
          cotWorkMessages.push(input);
        }
      }
    }
  );

  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(result.output), { recorded: true, steps: 3 });
  assert.deepEqual(cotWorkMessages, [{
    steps: [
      { task: "Read context", status: "completed" },
      { task: "Apply patch", status: "in_progress" },
      { task: "Run checks", status: "pending" }
    ],
    reason: "scope changed"
  }]);
});

test("cot_work rejects active plans without an in-progress step", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-cot-work-invalid-"));
  const result = await executeToolCall(
    {
      call_id: "cot_invalid_pending",
      name: "cot_work",
      arguments: JSON.stringify({
        steps: [
          { task: "Read context", status: "pending" },
          { task: "Apply patch", status: "pending" }
        ]
      })
    },
    { userHome: path.join(root, "user"), projectHome: path.join(root, "project") }
  );

  assert.equal(result.success, false);
  assert.match(result.output, /exactly one in_progress step/);
});

test("cot_work rejects active plans with multiple in-progress steps", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-cot-work-invalid-"));
  const result = await executeToolCall(
    {
      call_id: "cot_invalid_multiple",
      name: "cot_work",
      arguments: JSON.stringify({
        steps: [
          { task: "Read context", status: "in_progress" },
          { task: "Apply patch", status: "in_progress" }
        ]
      })
    },
    { userHome: path.join(root, "user"), projectHome: path.join(root, "project") }
  );

  assert.equal(result.success, false);
  assert.match(result.output, /exactly one in_progress step/);
});

test("cot_work accepts a terminal fully completed plan", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-cot-work-terminal-"));
  const messages: unknown[] = [];
  const result = await executeToolCall(
    {
      call_id: "cot_terminal",
      name: "cot_work",
      arguments: JSON.stringify({
        steps: [
          { task: "Read context", status: "completed" },
          { task: "Apply patch", status: "completed" }
        ]
      })
    },
    {
      userHome: path.join(root, "user"),
      projectHome: path.join(root, "project"),
      agentCallHandlers: {
        "session.cot_work": (input) => {
          messages.push(input);
        }
      }
    }
  );

  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(result.output), { recorded: true, steps: 2 });
  assert.deepEqual(messages, [{
    steps: [
      { task: "Read context", status: "completed" },
      { task: "Apply patch", status: "completed" }
    ]
  }]);
});

test("cot_work agent call handler rejects invalid active plan state", async () => {
  const handler = createCotWorkAgentCallHandler(() => undefined);

  await assert.rejects(
    async () => handler({
      steps: [
        { task: "Read context", status: "pending" },
        { task: "Apply patch", status: "pending" }
      ]
    }, { tool: "cot_work" }),
    /exactly one in_progress step/
  );
});

test("tool process agent calls are routed separately from model-visible output", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-agentcall-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "agentcall"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "agentcall", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["./index.mjs"] },
      schema: { type: "function", name: "agentcall", parameters: { type: "object", properties: {} } }
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "agentcall", "index.mjs"),
    "console.log(`[[ndx-agentcall:${JSON.stringify({ type: 'ndx.agentcall', name: 'session.cot_work', input: { steps: [{ task: 'Plan', status: 'in_progress' }] } })}]]`); console.log(JSON.stringify({ type: 'result', success: true, output: 'done' }));\n",
    "utf8"
  );
  const messages: unknown[] = [];

  const result = await executeToolCall(
    { name: "agentcall", arguments: "{}" },
    {
      userHome,
      projectHome,
      agentCallHandlers: {
        "session.cot_work": (input) => {
          messages.push({ kind: NDX_COT_WORK_CONTENT_KIND, ...(input as Record<string, unknown>) });
        }
      }
    }
  );

  assert.equal(result.status, "success");
  assert.equal(result.stdoutText.includes("[[ndx-agentcall:"), true);
  assert.equal(result.output, "done");
  assert.deepEqual(messages, [{ kind: "cot_work", steps: [{ task: "Plan", status: "in_progress" }] }]);
});

test("tool process sidebar agent calls are routed through the executor handler", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-sidebar-agentcall-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "sidebar"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "sidebar", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["./index.mjs"] },
      schema: { type: "function", name: "sidebar", parameters: { type: "object", properties: {} } }
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "sidebar", "index.mjs"),
    "console.log(`[[ndx-agentcall:${JSON.stringify({ type: 'ndx.agentcall', name: 'session.sidebar_item', input: { group: { id: 'skills', title: '스킬' }, key: 'skill:demo', title: 'demo', kind: 'skill' } })}]]`); console.log(JSON.stringify({ type: 'result', success: true, output: 'done' }));\n",
    "utf8"
  );
  const sidebarItems: unknown[] = [];

  const result = await executeToolCall(
    { name: "sidebar", arguments: "{}" },
    {
      userHome,
      projectHome,
      agentCallHandlers: {
        [NDX_SIDEBAR_ITEM_AGENTCALL_NAME]: (input) => {
          sidebarItems.push(input);
        }
      }
    }
  );

  assert.equal(result.status, "success");
  assert.equal(result.output, "done");
  assert.equal(result.events.some((event) => event.type === "progress"), false);
  assert.deepEqual(sidebarItems, [{
    group: { id: "skills", title: "스킬" },
    key: "skill:demo",
    title: "demo",
    kind: "skill"
  }]);
});

test("loadSkill loads an available project skill by name", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-skill-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  const skillPath = await writeSkill(path.join(projectHome, ".ndx", "skills", "demo"), "demo", "demo skill", "Use the demo workflow.");
  const sidebarItems: unknown[] = [];

  const result = await executeToolCall(
    { call_id: "skill_1", name: "loadSkill", arguments: JSON.stringify({ name: "demo" }) },
    {
      userHome,
      projectHome,
      turnContext: skillTurnContext("demo", "demo skill", skillPath),
      agentCallHandlers: { [NDX_SIDEBAR_ITEM_AGENTCALL_NAME]: (input) => { sidebarItems.push(input); } }
    }
  );

  assert.equal(result.success, true);
  assert.equal(result.status, "success");
  assert.equal((sidebarItems[0] as { group?: { title?: string } }).group?.title, "스킬");
  assert.match(result.output, /<skill>\n<name>demo<\/name>/);
  assert.match(result.output, /<path>.*\/project\/\.ndx\/skills\/demo\/SKILL\.md<\/path>/);
  assert.match(result.output, /Use the demo workflow\./);
});

test("loadSkill returns already loaded when hidden session context includes the skill", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-skill-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  const skillPath = await writeSkill(path.join(projectHome, ".ndx", "skills", "demo"), "demo", "demo skill", "Use the demo workflow.");
  const sidebarItems: unknown[] = [];

  const result = await executeToolCall(
    { call_id: "skill_4", name: "loadSkill", arguments: JSON.stringify({ name: "demo" }) },
    {
      userHome,
      projectHome,
      turnContext: {
        ...skillTurnContext("demo", "demo skill", skillPath),
        history: [{ role: "assistant", content: `<skill>\n<name>demo</name>\n<path>${skillPath}</path>\n</skill>` }]
      },
      agentCallHandlers: { [NDX_SIDEBAR_ITEM_AGENTCALL_NAME]: (input) => { sidebarItems.push(input); } }
    }
  );

  assert.equal(result.success, true);
  assert.equal((sidebarItems[0] as { group?: { title?: string } }).group?.title, "스킬");
  assert.match(result.output, /Skill already loaded in the current session context: demo/);
  assert.doesNotMatch(result.output, /Use the demo workflow\./);
});

test("loadSkill corrects minor skill name differences", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-skill-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  const skillPath = await writeSkill(path.join(projectHome, ".ndx", "skills", "web-service-scaffold"), "web-service-scaffold", "web scaffold", "Use scaffold workflow.");

  const result = await executeToolCall(
    { call_id: "skill_5", name: "loadSkill", arguments: JSON.stringify({ name: "web service scaffold" }) },
    { userHome, projectHome, turnContext: skillTurnContext("web-service-scaffold", "web scaffold", skillPath) }
  );

  assert.equal(result.success, true);
  assert.match(result.output, /<name>web-service-scaffold<\/name>/);
  assert.match(result.output, /Use scaffold workflow\./);
});

test("prompt_rewrite uses configured rewrite model and existing base tools inside its rewrite loop", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-prompt-rewrite-"));
  const userHome = path.join(root, "ndx");
  const projectHome = path.join(userHome, "workspace", "project");
  await fs.mkdir(path.join(userHome, ".ndx"), { recursive: true });
  await fs.mkdir(path.join(projectHome, "docs"), { recursive: true });
  await fs.writeFile(path.join(userHome, ".ndx", "settings.json"), JSON.stringify({ tools: { prompt_rewrite: { model: "qwen3.6-35b-mp" } } }), "utf8");
  await fs.writeFile(path.join(projectHome, "docs", "askuserquestion.md"), "askuserquestion E2E tests verify the modal response flow.\n", "utf8");

  const requests: Array<{ model?: string; input?: unknown }> = [];
  const databaseQueries: { text: string; values: unknown[] }[] = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const parsed = JSON.parse(body) as { model?: string; input?: unknown };
      requests.push(parsed);
      const text = JSON.stringify({
          rewritten_prompt: "목표: askuserquestion 관련 테스트 맥락을 반영해 요청을 명확히 수행한다.\n근거/사실: 현재 세션, session_history, 기존 파일 검색 결과를 참고했다.\n제약: 원문 범위를 확장하지 않는다.\n절차: 관련 파일과 세션 근거를 확인한 뒤 필요한 변경만 수행한다.\n출력: 재작성 근거와 결과를 분리해 보고한다.",
          report: "현재 세션 생략 표현, session_history 결과, grep_search 결과를 근거로 작업 대상을 명시했다.",
          facts: ["다른 세션에 askuserquestion 모달 응답 흐름 결정이 있다.", "docs/askuserquestion.md에 askuserquestion E2E 테스트 설명이 있다."],
          assumptions: ["사용자는 기존 askuserquestion 흐름을 가리킨다."],
          ambiguities: [],
          should_ask_user: false,
          pass_through: false
        });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        output: requests.length === 1
          ? [{ type: "function_call", call_id: "rewrite_history_1", name: "session_history", arguments: JSON.stringify({ scope: "project", query: "askuserquestion 테스트", limit: 2 }) }]
          : requests.length === 2
            ? [{ type: "function_call", call_id: "rewrite_search_1", name: "grep_search", arguments: JSON.stringify({ pattern: "askuserquestion", path: "docs", glob: "*.md", limit: 5 }) }]
            : [{ type: "message", content: [{ type: "output_text", text }] }]
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const port = address && typeof address === "object" ? address.port : 0;
    const model = { type: "openai" as const, model: "session-model", url: `http://127.0.0.1:${port}`, token: "", contextsize: 200_000 };
    const result = await executeToolCall(
      { call_id: "rewrite_1", name: "prompt_rewrite", arguments: JSON.stringify({ prompt: "그거 테스트도 추가해", reason: "대화 생략 표현 해소" }) },
      {
        userHome,
        projectHome,
        model,
        sessionid: "018f0000-0000-7000-8000-000000000001",
        session: {
          sessionid: "018f0000-0000-7000-8000-000000000001",
          userid: "ndev",
          title: "",
          lastupdated: new Date(),
          mode: "none",
          path: projectHome,
          projectname: "018f0000-0000-7000-8000-000000000002",
          model,
          isrunning: true,
          turnphase: "model_request",
          interruptrequested: false,
          interruptrequestedat: null,
          interruptcompletedat: null
        },
        database: {
          async query(text, values) {
            databaseQueries.push({ text, values: values ?? [] });
            return {
              rows: [{
                dataid: "history-1",
                sessionid: "018f0000-0000-7000-8000-000000000003",
                projectname: "018f0000-0000-7000-8000-000000000002",
                path: projectHome,
                title: "askuserquestion 설계",
                type: "assistant",
                createdat: new Date("2026-05-31T00:00:00.000Z"),
                text: "다른 세션에서 askuserquestion 모달 응답 흐름을 테스트 대상으로 결정했다.",
                tokenlength: 11,
                rank: 0.42
              }],
              rowCount: 1
            } as never;
          },
          async close() {}
        },
        turnContext: {
          developer: { role: "system", content: "" },
          user: { role: "user", content: "" },
          history: [{ role: "user", content: "기능은 askuserquestion과 비슷하다." }],
          historyRows: [
            { dataid: "1", sessionid: "018f0000-0000-7000-8000-000000000001", type: "user", contents: { kind: "user_message", text: "기능은 askuserquestion과 비슷하다." }, createdat: new Date() },
            { dataid: "2", sessionid: "018f0000-0000-7000-8000-000000000001", type: "assistant", contents: { kind: "assistant_message", text: "askuserquestion은 사용자에게 확인 질문을 보내는 도구입니다." }, createdat: new Date() },
            { dataid: "3", sessionid: "018f0000-0000-7000-8000-000000000001", type: "assistant", contents: { kind: "tool_result", iteration: 1, results: [{ toolCallId: "x", tool: "grep_search", success: true, output: "should be omitted from compact history" }] }, createdat: new Date() }
          ]
        }
      }
    );

    assert.equal(result.success, true);
    assert.equal(requests.length, 3);
    assert.equal(requests[0]?.model, "qwen3.6-35b-mp");
    assert.equal(requests[1]?.model, "qwen3.6-35b-mp");
    assert.equal(requests[2]?.model, "qwen3.6-35b-mp");
    const output = JSON.parse(result.output) as { rewritten_prompt: string; report: string; tool_calls: Array<{ tool: string; success: boolean; output: string }>; model: { source: string; model: string } };
    assert.match(output.rewritten_prompt, /목표:/);
    assert.match(output.rewritten_prompt, /session_history/);
    assert.match(output.report, /grep_search/);
    assert.equal(output.model.source, "settings.tools.prompt_rewrite.model");
    assert.equal(output.model.model, "qwen3.6-35b-mp");
    assert.deepEqual(output.tool_calls.map((item) => item.tool), ["session_history", "grep_search"]);
    assert.equal(output.tool_calls[0]?.success, true);
    assert.match(output.tool_calls[0]?.output ?? "", /다른 세션에서 askuserquestion/);
    assert.equal(output.tool_calls[1]?.success, true);
    assert.match(output.tool_calls[1]?.output ?? "", /askuserquestion E2E tests/);
    assert.match(databaseQueries[0]?.text ?? "", /WHERE s\.projectname = \$1/);
    assert.deepEqual(databaseQueries[0]?.values, ["018f0000-0000-7000-8000-000000000002", "askuserquestion 테스트", 2]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("builtin file tools read, search, edit, write, and run bash within the NDX virtual root", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-file-tools-"));
  const userHome = path.join(root, "ndx");
  const projectHome = path.join(userHome, "workspace", "project");
  await fs.mkdir(path.join(projectHome, "src"), { recursive: true });
  await fs.mkdir(path.join(userHome, ".ndx", "skills", "demo", "references"), { recursive: true });
  await fs.writeFile(path.join(projectHome, "src", "a.ts"), "alpha\nneedle\nomega\n", "utf8");
  await fs.writeFile(path.join(projectHome, "src", "sample.png"), Buffer.from([1, 2, 3]));
  await fs.writeFile(path.join(userHome, ".ndx", "skills", "demo", "references", "checklist.md"), "global skill reference\n", "utf8");
  const sidebarItems: unknown[] = [];
  const options = { userHome, projectHome, agentCallHandlers: { [NDX_SIDEBAR_ITEM_AGENTCALL_NAME]: (input: unknown) => { sidebarItems.push(input); } } };

  const read = await executeToolCall({ name: "read_file", arguments: JSON.stringify({ path: "src/a.ts", offset: 1, limit: 1 }) }, options);
  assert.equal(read.success, true);
  assert.equal(read.status, "success");
  assert.ok(read.events.some((event) => event.type === "progress"));
  assert.equal((sidebarItems.at(-1) as { group?: { id?: string; title?: string }; kind?: string }).group?.id, "file-references");
  assert.equal((sidebarItems.at(-1) as { group?: { id?: string; title?: string }; kind?: string }).group?.title, "파일참조");
  assert.equal((sidebarItems.at(-1) as { group?: { id?: string; title?: string }; kind?: string }).kind, "file_reference");
  assert.equal(read.events.at(-1)?.type, "result");
  assert.equal(JSON.parse(read.output).content, "needle");

  const globalRead = await executeToolCall(
    { name: "read_file", arguments: JSON.stringify({ path: path.join(userHome, ".ndx", "skills", "demo", "references", "checklist.md") }) },
    options
  );
  assert.equal(globalRead.success, true);
  assert.equal(JSON.parse(globalRead.output).content, "global skill reference");

  const glob = await executeToolCall({ name: "glob", arguments: JSON.stringify({ pattern: "src/*.ts" }) }, options);
  assert.equal(glob.success, true);
  assert.equal(glob.events.at(-1)?.type, "result");
  assert.deepEqual(JSON.parse(glob.output).files, [path.join(projectHome, "src", "a.ts")]);

  const grep = await executeToolCall({ name: "grep_search", arguments: JSON.stringify({ pattern: "needle", path: "src", glob: "*.ts" }) }, options);
  assert.equal(grep.success, true);
  assert.equal(grep.events.at(-1)?.type, "result");
  assert.equal(JSON.parse(grep.output).matches[0].line, 2);

  const edit = await executeToolCall(
    { name: "edit", arguments: JSON.stringify({ file_path: "src/a.ts", old_string: "needle", new_string: "thread" }) },
    options
  );
  assert.equal(edit.success, true);
  assert.equal(edit.events.at(-1)?.type, "result");
  assert.equal(await fs.readFile(path.join(projectHome, "src", "a.ts"), "utf8"), "alpha\nthread\nomega\n");

  const write = await executeToolCall(
    { name: "write_file", arguments: JSON.stringify({ file_path: "src/b.txt", content: "written" }) },
    options
  );
  assert.equal(write.success, true);
  assert.equal(write.events.at(-1)?.type, "result");
  assert.equal(await fs.readFile(path.join(projectHome, "src", "b.txt"), "utf8"), "written");

  const bash = await executeToolCall({ name: "bash", arguments: JSON.stringify({ command: "printf bash-ok", workdir: "." }) }, options);
  assert.equal(bash.success, true);
  assert.equal(bash.events.at(-1)?.type, "result");
  assert.match(bash.output, /bash-ok/);

  const image = await executeToolCall({ name: "getImage", arguments: JSON.stringify({ path: "src/sample.png" }) }, options);
  assert.equal(image.success, true);
  assert.equal(image.effects?.some((effect) => effect.type === "append_user_message"), true);
  assert.equal(image.effects?.some((effect) => effect.type === "inline_appended_user_message"), true);
  const appendEffect = image.effects?.find((effect): effect is Extract<NonNullable<typeof image.effects>[number], { type: "append_user_message" }> => effect.type === "append_user_message");
  assert.equal(appendEffect?.attachments?.[0]?.path, path.join(projectHome, "src", "sample.png"));
  assert.equal(appendEffect?.attachments?.[0]?.mimeType, "image/png");

  const globalBash = await executeToolCall(
    { name: "bash", arguments: JSON.stringify({ command: "pwd", workdir: path.join(userHome, ".ndx", "skills", "demo") }) },
    options
  );
  assert.equal(globalBash.success, true);
  assert.equal(globalBash.output.includes(path.join(userHome, ".ndx", "skills", "demo")), true);
});

test("builtin tools emit protocol errors for invalid runtime situations", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-file-tools-"));
  const userHome = path.join(root, "ndx");
  const projectHome = path.join(userHome, "workspace", "project");
  await fs.mkdir(path.join(projectHome, "src"), { recursive: true });
  await fs.writeFile(path.join(projectHome, "src", "a.ts"), "same\nsame\n", "utf8");

  const cases = [
    executeToolCall({ name: "read_file", arguments: JSON.stringify({ path: "missing.txt" }) }, { userHome, projectHome }),
    executeToolCall({ name: "write_file", arguments: JSON.stringify({ file_path: path.join(root, "outside.txt"), content: "x" }) }, { userHome, projectHome }),
    executeToolCall({ name: "glob", arguments: JSON.stringify({ pattern: "", path: "." }) }, { userHome, projectHome }),
    executeToolCall({ name: "grep_search", arguments: JSON.stringify({ pattern: "", path: "." }) }, { userHome, projectHome }),
    executeToolCall({ name: "edit", arguments: JSON.stringify({ file_path: "src/a.ts", old_string: "same", new_string: "other" }) }, { userHome, projectHome }),
    executeToolCall({ name: "bash", arguments: JSON.stringify({ command: "exit 7", workdir: "." }) }, { userHome, projectHome })
  ];

  for (const result of await Promise.all(cases)) {
    assert.equal(result.success, false);
    assert.equal(result.status, "failed");
    assert.equal(result.events.at(-1)?.type, "error");
    assert.match(result.output, /required|exist|escapes|matched|exit_code/i);
  }
});

test("builtin file tools map Windows volume paths before invoking shell tools", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-volume-tools-"));
  const containerRoot = path.join(root, "container");
  const userHome = containerRoot;
  const containerWorkspace = path.join(containerRoot, "workspace");
  const projectHome = path.join(containerWorkspace, "ndx2");
  await fs.mkdir(path.join(projectHome, "src"), { recursive: true });
  await fs.writeFile(path.join(projectHome, "src", "a.ts"), "volume path\n", "utf8");

  const read = await executeToolCall(
    { name: "read_file", arguments: JSON.stringify({ path: "F:\\dev\\ndx2\\volume\\workspace\\ndx2\\src\\a.ts" }) },
    { userHome, projectHome, hostRoot: "F:/dev/ndx2/volume", containerRoot, containerWorkspace }
  );

  assert.equal(read.success, true);
  assert.equal(JSON.parse(read.output).content, "volume path");
});

test("tool arg template applies runtime arguments by property name", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "pair"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "pair", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["./index.mjs", "{left}", "{right}"] },
      schema: {
        type: "function",
        name: "pair",
        parameters: {
          type: "object",
          properties: {
            left: { type: "string" },
            right: { type: "object" }
          }
        }
      }
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "pair", "index.mjs"),
    "process.stdout.write(JSON.stringify({ left: process.argv[2], right: JSON.parse(process.argv[3]), env: JSON.parse(process.env.NDX_TOOL_ARGUMENTS) }));\n",
    "utf8"
  );

  const result = await executeToolCall(
    { call_id: "pair_1", name: "pair", arguments: JSON.stringify({ left: "L", right: { value: 7 } }) },
    { userHome, projectHome }
  );

  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(result.output), { left: "L", right: { value: 7 }, env: { left: "L", right: { value: 7 } } });
});

test("tool stdin template applies runtime arguments by property name", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "stdin_echo"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "stdin_echo", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["./index.mjs"], stdin: "{text}" },
      schema: {
        type: "function",
        name: "stdin_echo",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string" }
          }
        }
      }
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "stdin_echo", "index.mjs"),
    "process.stdin.setEncoding('utf8'); let text = ''; process.stdin.on('data', chunk => text += chunk); process.stdin.on('end', () => process.stdout.write(text));\n",
    "utf8"
  );

  const result = await executeToolCall(
    { call_id: "stdin_1", name: "stdin_echo", arguments: JSON.stringify({ text: "from-stdin" }) },
    { userHome, projectHome }
  );

  assert.equal(result.success, true);
  assert.equal(result.output, "from-stdin");
});

test("executeToolCalls runs an external process tool", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "echo"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "echo", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["./index.mjs", "{message}"] },
      schema: { type: "function", name: "echo", parameters: { type: "object", properties: { message: { type: "string" } } } }
    }),
    "utf8"
  );
  await fs.writeFile(path.join(userHome, ".ndx", "tools", "echo", "index.mjs"), "process.stdout.write(process.argv[2] || '')\n", "utf8");

  const result = await executeToolCall({ call_id: "call_1", name: "echo", arguments: JSON.stringify({ message: "hello" }) }, { userHome, projectHome });

  assert.equal(result.success, true);
  assert.equal(result.output, "hello");
});

test("executeToolCalls starts process tools in parallel and preserves call order", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "delay"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "delay", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["./index.mjs", "{label}", "{ms}"] },
      schema: {
        type: "function",
        name: "delay",
        parameters: {
          type: "object",
          properties: {
            label: { type: "string" },
            ms: { type: "number" }
          }
        }
      }
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "delay", "index.mjs"),
    "const started = Date.now(); setTimeout(() => process.stdout.write(JSON.stringify({ label: process.argv[2] || '', started, ended: Date.now() })), Number(process.argv[3] || 0));\n",
    "utf8"
  );

  const results = await executeToolCalls(
    [
      { call_id: "first", name: "delay", arguments: JSON.stringify({ label: "a", ms: 900 }) },
      { call_id: "second", name: "delay", arguments: JSON.stringify({ label: "b", ms: 900 }) }
    ],
    { userHome, projectHome }
  );

  const payloads = results.map((result) => JSON.parse(result.output) as { label: string; started: number; ended: number });
  assert.deepEqual(payloads.map((payload) => payload.label), ["a", "b"]);
  assert.ok(Math.abs(payloads[0]!.started - payloads[1]!.started) < 700);
});

test("tool process protocol reports progress and final result through observer", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "protocol"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "protocol", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["./index.mjs"] },
      schema: { type: "function", name: "protocol", parameters: { type: "object", properties: {} } }
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "protocol", "index.mjs"),
    "console.log(JSON.stringify({ type: 'progress', message: 'step 1' })); console.log(JSON.stringify({ type: 'result', success: true, output: { ok: true } }));\n",
    "utf8"
  );
  const progress: string[] = [];
  const finished: string[] = [];

  const result = await executeToolCall(
    { name: "protocol", arguments: "{}" },
    {
      userHome,
      projectHome,
      observer: {
        onToolProgress(event) {
          if (event.event.type === "progress") progress.push(event.event.message);
        },
        onToolFinished(result) {
          finished.push(result.status);
        }
      }
    }
  );

  assert.equal(result.status, "success");
  assert.deepEqual(progress, ["step 1"]);
  assert.deepEqual(JSON.parse(result.output), { ok: true });
  assert.deepEqual(finished, ["success"]);
});

test("tool process protocol treats explicit error event as failed even with exit zero", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await fs.mkdir(path.join(userHome, ".ndx", "tools", "logical_fail"), { recursive: true });
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "logical_fail", "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["./index.mjs"] },
      schema: { type: "function", name: "logical_fail", parameters: { type: "object", properties: {} } }
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(userHome, ".ndx", "tools", "logical_fail", "index.mjs"),
    "console.log(JSON.stringify({ type: 'error', success: false, message: 'logical failure' }));\n",
    "utf8"
  );

  const result = await executeToolCall({ name: "logical_fail", arguments: "{}" }, { userHome, projectHome });

  assert.equal(result.status, "failed");
  assert.equal(result.success, false);
  assert.equal(result.error, "logical failure");
});

test("tool process manager cancels a process group on timeout", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-timeout-tools-"));
  const userHome = path.join(root, "ndx");
  const projectHome = path.join(userHome, "workspace", "project");
  await fs.mkdir(projectHome, { recursive: true });

  const result = await executeToolCall(
    { name: "bash", arguments: JSON.stringify({ command: "sleep 5", workdir: "." }) },
    { userHome, projectHome, timeoutMs: 150, killGraceMs: 100 }
  );

  assert.equal(result.status, "timeout");
  assert.equal(result.success, false);
});

test("tool process manager supports AbortSignal cancellation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-cancel-tools-"));
  const userHome = path.join(root, "ndx");
  const projectHome = path.join(userHome, "workspace", "project");
  await fs.mkdir(projectHome, { recursive: true });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 150);
  const interrupts: string[] = [];

  const result = await executeToolCall(
    { name: "bash", arguments: JSON.stringify({ command: "sleep 5", workdir: "." }) },
    {
      userHome,
      projectHome,
      timeoutMs: 5_000,
      killGraceMs: 100,
      signal: controller.signal,
      observer: {
        onToolInterrupt(event) {
          interrupts.push(event.phase);
        }
      }
    }
  );

  assert.equal(result.status, "cancelled");
  assert.equal(result.success, false);
  assert.deepEqual(interrupts.slice(0, 2), ["requested", "sigterm"]);
  assert.ok(interrupts.includes("exited"));
});

test("tool process manager cancels when an async observer detects interruption", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-observer-cancel-tools-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  const toolHome = path.join(userHome, ".ndx", "tools", "observer_cancel");
  await fs.mkdir(toolHome, { recursive: true });
  await fs.mkdir(projectHome, { recursive: true });
  await fs.writeFile(
    path.join(toolHome, "tool.json"),
    JSON.stringify({
      tool: { command: "sh", args: ["./index.sh"] },
      schema: { type: "function", name: "observer_cancel", parameters: { type: "object", properties: {} } }
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(toolHome, "index.sh"),
    "printf '%s\\n' '{\"type\":\"progress\",\"message\":\"started\"}'\nsleep 5\nprintf '%s\\n' '{\"type\":\"result\",\"success\":true,\"output\":\"done\"}'\n",
    "utf8"
  );

  const result = await executeToolCall(
    { name: "observer_cancel", arguments: "{}" },
    {
      userHome,
      projectHome,
      timeoutMs: 5_000,
      killGraceMs: 100,
      observer: {
        async onToolProgress() {
          throw new Error("interrupted by observer");
        }
      }
    }
  );

  assert.equal(result.status, "cancelled");
  assert.equal(result.success, false);
});

async function writeTool(directory: string, name: string, description: string) {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "tool.json"),
    JSON.stringify({
      tool: { command: "node", args: ["-e", "process.stdout.write('ok')"] },
      schema: { type: "function", name, description, parameters: { type: "object", properties: {} } }
    }),
    "utf8"
  );
}

async function executeToolCall(toolCall: unknown, options: NDXToolExecutionOptions = {}): Promise<NDXToolExecutionResult> {
  const [result] = await executeToolCalls([toolCall], {
    ...options,
    agentCallHandlers: {
      [NDX_SIDEBAR_ITEM_AGENTCALL_NAME]: () => undefined,
      ...options.agentCallHandlers
    }
  });
  assert.ok(result);
  return result;
}

async function writeSkill(directory: string, name: string, description: string, body: string): Promise<string> {
  await fs.mkdir(directory, { recursive: true });
  const skillPath = path.join(directory, "SKILL.md");
  await fs.writeFile(skillPath, `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`, "utf8");
  return skillPath;
}

function skillTurnContext(name: string, description: string, skillPath: string) {
  return {
    developer: {
      role: "system" as const,
      content: `<available_skills_instructions>\n## Skills\n### Available skills\n- ${name}: ${description} (file: ${skillPath})\n</available_skills_instructions>`
    },
    user: { role: "user" as const, content: "" },
    history: []
  };
}
