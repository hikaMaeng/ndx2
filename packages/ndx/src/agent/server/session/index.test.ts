import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import test from "node:test";
import {
  SESSION_TABLE_SQL,
  SESSION_TABLE_MIGRATION_SQL,
  SESSIONDATA_TABLE_SQL,
  appendSessionData,
  completeSessionInterrupt,
  createSession,
  deleteSession,
  initSessionDatabase,
  listSession,
  pruneProjectPathMismatchedSession,
  requestSessionInterrupt,
  runSessionTurn,
  updateSessionEndTurn,
  updateSessionStartTurn,
  updateSessionTitle
} from "./index.js";
import { writeSessionAttachments } from "./attachments.js";
import { createNDXHookRuntime } from "../hook/index.js";
import { NDX_TURN_EVENT } from "../../common/protocol/index.js";
import type { NDXSessionDataRow, NDXSessionRow } from "./index.js";
import type { NDXDatabase } from "../init/index.js";

function modelConfig(model = "gpt-test") {
  return { type: "openai" as const, model, url: "https://example.test", token: "", contextsize: 200_000 };
}

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error("condition was not met before timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("session schema SQL defines the required metadata and history tables", () => {
  assert.match(SESSION_TABLE_SQL, /sessionid uuid PRIMARY KEY/);
  assert.match(SESSION_TABLE_SQL, /userid text NOT NULL/);
  assert.match(SESSION_TABLE_SQL, /mode text NOT NULL DEFAULT 'none' CHECK \(mode IN \('none', 'light'\)\)/);
  assert.match(SESSION_TABLE_SQL, /model jsonb NOT NULL CHECK \(/);
  assert.match(SESSION_TABLE_SQL, /model->>'type' = 'openai'/);
  assert.match(SESSION_TABLE_SQL, /jsonb_typeof\(model->'contextsize'\) = 'number'/);
  assert.match(SESSION_TABLE_SQL, /turnphase text NOT NULL DEFAULT 'idle'/);
  assert.match(SESSION_TABLE_SQL, /interruptrequested boolean NOT NULL DEFAULT false/);
  assert.match(SESSION_TABLE_MIGRATION_SQL, /ADD COLUMN IF NOT EXISTS interruptrequested/);
  assert.match(SESSIONDATA_TABLE_SQL, /sessionid uuid NOT NULL REFERENCES "session" \(sessionid\) ON DELETE CASCADE/);
  assert.match(SESSIONDATA_TABLE_SQL, /contents jsonb NOT NULL/);
});

test("initSessionDatabase runs explicit table and index SQL", async () => {
  const queries: string[] = [];
  const database: NDXDatabase = {
    async query(text) {
      queries.push(text);
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  await initSessionDatabase(database);

  assert.equal(queries.length, 5);
  assert.equal(queries[0], SESSION_TABLE_SQL);
  assert.equal(queries[1], SESSION_TABLE_MIGRATION_SQL);
  assert.equal(queries[3], SESSIONDATA_TABLE_SQL);
});

test("createSession inserts uuid7-shaped ids and default title and mode", async () => {
  const valuesSeen: unknown[][] = [];
  const database: NDXDatabase = {
    async query(_text, values) {
      valuesSeen.push(values ?? []);
      return {
        rows: [
          {
            sessionid: values?.[0],
            userid: values?.[1],
            title: values?.[2],
            mode: values?.[3],
            path: values?.[4],
            projectid: values?.[5],
            model: JSON.parse(String(values?.[6])),
            isrunning: false,
            lastupdated: new Date()
          }
        ],
        rowCount: 1
      } as never;
    },
    async close() {}
  };

  const session = await createSession(database, {
    userid: "ndev",
    path: "/ndx/workspace",
    projectid: "project-1",
    model: modelConfig()
  });

  assert.match(session.sessionid, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(session.title, "");
  assert.equal(session.mode, "none");
  assert.equal(valuesSeen[0][1], "ndev");
});

test("listSession selects sessions by owner and project newest first", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return {
        rows: [
          {
            sessionid: "018f0000-0000-7000-8000-000000000001",
            userid: values?.[0],
            title: "최근 세션",
            mode: "none",
            path: "/ndx/workspace",
            projectid: values?.[1],
            model: modelConfig(),
            isrunning: false,
            lastupdated: new Date()
          }
        ],
        rowCount: 1
      } as never;
    },
    async close() {}
  };

  const sessions = await listSession(database, "ndev", "project-1");

  assert.equal(sessions.length, 1);
  assert.equal(queries[0].values[0], "ndev");
  assert.equal(queries[0].values[1], "project-1");
  assert.match(queries[0].text, /WHERE userid = \$1\s+AND projectid = \$2/);
  assert.match(queries[0].text, /ORDER BY lastupdated DESC, sessionid DESC/);
});

test("pruneProjectPathMismatchedSession deletes same-path sessions with stale project ids", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return {
        rows: [],
        rowCount: /DELETE FROM "session"/i.test(text) ? 1 : /DELETE FROM sessiondata/i.test(text) ? 3 : 1
      } as never;
    },
    async close() {}
  };

  const result = await pruneProjectPathMismatchedSession(database, "ndev", "/ndx/workspace/test3", "project-current");

  assert.deepEqual(result, { sessionCount: 1, sessionDataCount: 3, tokenCount: 1 });
  assert.equal(queries.length, 3);
  assert.match(queries[0].text, /DELETE FROM sessiontoken/);
  assert.match(queries[1].text, /DELETE FROM sessiondata/);
  assert.match(queries[2].text, /DELETE FROM "session"/);
  for (const query of queries) {
    assert.match(query.text, /userid = \$1/);
    assert.match(query.text, /path = \$2/);
    assert.match(query.text, /projectid <> \$3/);
    assert.deepEqual(query.values, ["ndev", "/ndx/workspace/test3", "project-current"]);
  }
});

test("appendSessionData stores structured contents as json and promotes first user message to title", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      if (/UPDATE "session"/i.test(text)) {
        return { rows: [], rowCount: 0 } as never;
      }
      return {
        rows: [{ dataid: "1", sessionid: values?.[0], type: values?.[1], contents: JSON.parse(String(values?.[2])), createdat: new Date() }],
        rowCount: 1
      } as never;
    },
    async close() {}
  };

  await appendSessionData(database, "018f0000-0000-7000-8000-000000000000", "user", { kind: "user_message", text: "첫 질문" });

  assert.equal(queries.length, 2);
  assert.equal(queries[0].values[2], "{\"kind\":\"user_message\",\"text\":\"첫 질문\"}");
  assert.match(queries[1].text, /WHEN title = '' AND \$2 = 'user'/);
  assert.equal(queries[1].values[2], "첫 질문");
});

test("session attachments are stored under the project session directory and referenced by path", async () => {
  const projectHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-attachments-"));
  const rows = await writeSessionAttachments(projectHome, "018f0000-0000-7000-8000-000000000000", [
    {
      name: "sample.png",
      mimeType: "image/png",
      size: 3,
      data: Buffer.from([1, 2, 3]).toString("base64")
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, "image");
  assert.equal(rows[0]?.name, "sample.png");
  assert.match(rows[0]?.path ?? "", /\/\.ndx\/sessions\/018f0000-0000-7000-8000-000000000000\/.+\.png$/);
  assert.deepEqual(await fs.readFile(rows[0]!.path), Buffer.from([1, 2, 3]));
});

test("session lifecycle updates start, end, and title separately", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return {
        rows: [
          {
            sessionid: values?.[0],
            userid: "ndev",
            title: values?.[1] ?? "",
            mode: "none",
            path: "/ndx/workspace",
            projectid: "project-1",
            model: modelConfig(),
            isrunning: true,
            lastupdated: new Date()
          }
        ],
        rowCount: 1
      } as never;
    },
    async close() {}
  };

  await updateSessionStartTurn(database, "018f0000-0000-7000-8000-000000000000");
  await updateSessionEndTurn(database, "018f0000-0000-7000-8000-000000000000");
  await updateSessionTitle(database, "018f0000-0000-7000-8000-000000000000", "직접 변경한 제목");

  assert.match(queries[0].text, /isrunning = true/);
  assert.match(queries[0].text, /interruptrequested = false/);
  assert.match(queries[0].text, /interruptrequestedat = NULL/);
  assert.match(queries[0].text, /interruptcompletedat = NULL/);
  assert.match(queries[0].text, /turnphase = 'starting'/);
  assert.doesNotMatch(queries[0].text, /lastupdated = now\(\)/);
  assert.equal(queries[0].values[1], null);
  assert.match(queries[1].text, /isrunning = false/);
  assert.match(queries[1].text, /lastupdated = now\(\)/);
  assert.match(queries[2].text, /title = \$2/);
  assert.match(queries[2].text, /lastupdated = now\(\)/);
});

test("runSessionTurn appends user first, rebuilds history from sessiondata, calls model, and stores assistant", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-turn-"));
  const seenModelMessages: Array<{ role: string; content: string }> = [];
  const modelServer = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { input?: Array<{ role: string; content: Array<{ text: string }> }> | string };
      if (Array.isArray(payload.input)) {
        seenModelMessages.push(...payload.input.map((message) => ({ role: message.role, content: message.content.map((part) => part.text).join("") })));
      } else if (typeof payload.input === "string") {
        seenModelMessages.push(...payload.input.split(/\n\n(?=user:|assistant:|system:)/).map((part) => {
          const [role = "", ...content] = part.split(":\n");
          return { role, content: content.join(":\n") };
        }));
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "모델 응답" }] }] }));
    });
  });

  await new Promise<void>((resolve) => {
    modelServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = modelServer.address();
  assert(address && typeof address === "object");

  const session: NDXSessionRow = {
    sessionid: "018f0000-0000-7000-8000-000000000000",
    userid: "ndev",
    title: "",
    mode: "none",
    path: projectPath,
    projectid: "project-1",
    model: modelConfig("test-model"),
    isrunning: false,
    turnphase: "idle",
    interruptrequested: false,
    interruptrequestedat: null,
    interruptcompletedat: null,
    lastupdated: new Date("2026-05-12T00:00:00.000Z")
  };
  session.model.url = `http://127.0.0.1:${address.port}/v1`;
  const rows: NDXSessionDataRow[] = [
    {
      dataid: "1",
      sessionid: session.sessionid,
      type: "user",
      contents: { kind: "user_message", text: "이전 질문" },
      createdat: new Date("2026-05-12T00:00:01.000Z")
    },
    {
      dataid: "2",
      sessionid: session.sessionid,
      type: "assistant",
      contents: { kind: "assistant_message", text: "이전 답변" },
      createdat: new Date("2026-05-12T00:00:02.000Z")
    }
  ];
  const insertedTypes: string[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      if (/SET\s+model = COALESCE/i.test(text)) {
        session.isrunning = true;
        return { rows: [session], rowCount: 1 } as never;
      }
      if (/SET\s+turnphase = \$2/i.test(text)) {
        session.turnphase = String(values?.[1]);
        return { rows: [session], rowCount: 1 } as never;
      }
      if (/FROM "session"/i.test(text) && /WHERE sessionid = \$1/i.test(text)) {
        return { rows: [session], rowCount: 1 } as never;
      }
      if (/INSERT INTO sessiondata/i.test(text)) {
        const row = {
          dataid: String(rows.length + 1),
          sessionid: String(values?.[0]),
          type: String(values?.[1]),
          contents: JSON.parse(String(values?.[2])),
          createdat: new Date(`2026-05-12T00:00:0${rows.length + 1}.000Z`)
        };
        insertedTypes.push(row.type);
        rows.push(row);
        return { rows: [row], rowCount: 1 } as never;
      }
      if (/FROM sessiondata/i.test(text)) {
        return { rows: [...rows], rowCount: rows.length } as never;
      }
      if (/SET\s+isrunning = false/i.test(text)) {
        session.isrunning = false;
        return { rows: [session], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  try {
    await runSessionTurn(database, session, "새 질문");

    assert.deepEqual(insertedTypes, ["user", "assistant"]);
    assert.deepEqual(rows[2]?.contents, { kind: "user_message", text: "새 질문" });
    assert.deepEqual(rows[3]?.contents, { kind: "assistant_message", text: "모델 응답" });
    assert.equal(seenModelMessages.at(-3)?.content, "이전 질문");
    assert.equal(seenModelMessages.at(-2)?.content, "이전 답변");
    assert.equal(seenModelMessages.at(-1)?.content, "새 질문");
  } finally {
    modelServer.close();
    await once(modelServer, "close");
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("runSessionTurn rebuilds tool continuation from sessiondata before the next model request", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-tool-turn-"));
  await fs.mkdir(path.join(projectPath, ".ndx", "tools", "echo_value"), { recursive: true });
  await fs.writeFile(
    path.join(projectPath, ".ndx", "tools", "echo_value", "tool.json"),
    JSON.stringify({
      tool: { command: process.execPath, args: ["./index.mjs", "{value}"] },
      schema: {
        type: "function",
        name: "echo_value",
        parameters: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          additionalProperties: false
        }
      }
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(projectPath, ".ndx", "tools", "echo_value", "index.mjs"),
    "process.stdout.write(JSON.stringify({ type: 'result', success: true, output: `tool:${process.argv[2]}` }) + '\\n');\n",
    "utf8"
  );

  const modelInputs: unknown[] = [];
  const modelServer = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { input?: unknown };
      modelInputs.push(payload.input);
      response.writeHead(200, { "Content-Type": "application/json" });
      if (modelInputs.length === 1) {
        response.end(JSON.stringify({
          output: [{ type: "function_call", call_id: "call_echo_1", name: "echo_value", arguments: JSON.stringify({ value: "abc" }) }]
        }));
        return;
      }
      response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "최종 응답" }] }] }));
    });
  });

  await new Promise<void>((resolve) => {
    modelServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = modelServer.address();
  assert(address && typeof address === "object");

  const session: NDXSessionRow = {
    sessionid: "018f0000-0000-7000-8000-000000000001",
    userid: "ndev",
    title: "",
    mode: "none",
    path: projectPath,
    projectid: "project-1",
    model: modelConfig("test-model"),
    isrunning: false,
    turnphase: "idle",
    interruptrequested: false,
    interruptrequestedat: null,
    interruptcompletedat: null,
    lastupdated: new Date("2026-05-12T00:00:00.000Z")
  };
  session.model.url = `http://127.0.0.1:${address.port}/v1`;
  const rows: NDXSessionDataRow[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      if (/SET\s+model = COALESCE/i.test(text)) {
        session.isrunning = true;
        return { rows: [session], rowCount: 1 } as never;
      }
      if (/SET\s+turnphase = \$2/i.test(text)) {
        session.turnphase = String(values?.[1]);
        return { rows: [session], rowCount: 1 } as never;
      }
      if (/FROM "session"/i.test(text) && /WHERE sessionid = \$1/i.test(text)) {
        return { rows: [session], rowCount: 1 } as never;
      }
      if (/INSERT INTO sessiondata/i.test(text)) {
        const row = {
          dataid: String(rows.length + 1),
          sessionid: String(values?.[0]),
          type: String(values?.[1]),
          contents: JSON.parse(String(values?.[2])),
          createdat: new Date(`2026-05-12T00:00:${String(rows.length + 1).padStart(2, "0")}.000Z`)
        };
        rows.push(row);
        return { rows: [row], rowCount: 1 } as never;
      }
      if (/FROM sessiondata/i.test(text)) {
        return { rows: [...rows], rowCount: rows.length } as never;
      }
      if (/SET\s+isrunning = false/i.test(text)) {
        session.isrunning = false;
        return { rows: [session], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  try {
    await runSessionTurn(database, session, "도구를 써라");

    assert.equal(modelInputs.length, 2);
    assert.ok(rows.some((row) => row.contents && typeof row.contents === "object" && (row.contents as { kind?: unknown }).kind === "tool_call"));
    assert.ok(rows.some((row) => row.contents && typeof row.contents === "object" && (row.contents as { kind?: unknown }).kind === "tool_result"));
    assert.ok(Array.isArray(modelInputs[1]));
    const secondInput = modelInputs[1] as Array<Record<string, unknown>>;
    assert.ok(secondInput.some((item) => item.type === "function_call" && item.call_id === "call_echo_1"));
    assert.ok(secondInput.some((item) => item.type === "function_call_output" && item.call_id === "call_echo_1" && item.output === "tool:abc"));
  } finally {
    modelServer.close();
    await once(modelServer, "close");
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("response prepared hook can continue with a new request on the next tick", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-continue-"));
  const modelInputs: string[] = [];
  const modelServer = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { input?: Array<{ role: string; content: Array<{ text: string }> }> | string };
      if (Array.isArray(payload.input)) {
        modelInputs.push(payload.input.at(-1)?.content.map((part) => part.text).join("") ?? "");
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: `응답 ${modelInputs.length}` }] }] }));
    });
  });

  await new Promise<void>((resolve) => {
    modelServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = modelServer.address();
  assert(address && typeof address === "object");

  const session: NDXSessionRow = {
    sessionid: "018f0000-0000-7000-8000-000000000001",
    userid: "ndev",
    title: "",
    mode: "none",
    path: projectPath,
    projectid: "project-1",
    model: modelConfig("test-model"),
    isrunning: false,
    turnphase: "idle",
    interruptrequested: false,
    interruptrequestedat: null,
    interruptcompletedat: null,
    lastupdated: new Date("2026-05-12T00:00:00.000Z")
  };
  session.model.url = `http://127.0.0.1:${address.port}/v1`;
  const rows: NDXSessionDataRow[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      if (/SET\s+model = COALESCE/i.test(text)) {
        session.isrunning = true;
        return { rows: [session], rowCount: 1 } as never;
      }
      if (/SET\s+turnphase = \$2/i.test(text)) {
        session.turnphase = String(values?.[1]);
        return { rows: [session], rowCount: 1 } as never;
      }
      if (/FROM "session"/i.test(text) && /WHERE sessionid = \$1/i.test(text)) {
        return { rows: [session], rowCount: 1 } as never;
      }
      if (/INSERT INTO sessiondata/i.test(text)) {
        const row = {
          dataid: String(rows.length + 1),
          sessionid: String(values?.[0]),
          type: String(values?.[1]),
          contents: JSON.parse(String(values?.[2])),
          createdat: new Date(`2026-05-12T00:00:${String(rows.length + 1).padStart(2, "0")}.000Z`)
        };
        rows.push(row);
        return { rows: [row], rowCount: 1 } as never;
      }
      if (/FROM sessiondata/i.test(text)) {
        return { rows: [...rows], rowCount: rows.length } as never;
      }
      if (/SET\s+isrunning = false/i.test(text)) {
        session.isrunning = false;
        return { rows: [session], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };
  const hooks = createNDXHookRuntime({
    [NDX_TURN_EVENT.ResponsePrepared]: [{
      kind: "code",
      name: "continue-once",
      source: "system",
      run(context) {
        return context.requestText === "첫 요청" ? { nextRequestText: "후속 요청" } : { type: "noeffect" };
      }
    }]
  }, {});

  try {
    await runSessionTurn(database, session, "첫 요청", undefined, { hooks });
    await waitFor(() => rows.length >= 3);

    assert.deepEqual(rows.map((row) => row.type), ["user", "user", "assistant"]);
    assert.deepEqual(rows[0]?.contents, { kind: "user_message", text: "첫 요청" });
    assert.deepEqual(rows[1]?.contents, { kind: "user_message", text: "후속 요청" });
    assert.deepEqual(rows[2]?.contents, { kind: "assistant_message", text: "응답 2" });
    assert.deepEqual(modelInputs, ["첫 요청", "후속 요청"]);
  } finally {
    modelServer.close();
    await once(modelServer, "close");
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("session interrupt state is updated in the session table", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const row = {
    sessionid: "018f0000-0000-7000-8000-000000000000",
    userid: "ndev",
    title: "",
    mode: "none",
    path: "/ndx/workspace",
    projectid: "project-1",
    model: modelConfig(),
    isrunning: true,
    turnphase: "tool_execution",
    interruptrequested: true,
    interruptrequestedat: new Date("2026-05-12T00:00:01.000Z"),
    interruptcompletedat: null,
    lastupdated: new Date("2026-05-12T00:00:00.000Z")
  };
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return { rows: [row], rowCount: 1 } as never;
    },
    async close() {}
  };

  await requestSessionInterrupt(database, row.sessionid, "tool_execution");
  await completeSessionInterrupt(database, row.sessionid);

  assert.match(queries[0].text, /interruptrequested = true/);
  assert.match(queries[0].text, /turnphase = COALESCE\(\$2, turnphase\)/);
  assert.equal(queries[0].values[1], "tool_execution");
  assert.match(queries[1].text, /interruptrequested = false/);
  assert.match(queries[1].text, /interruptcompletedat = now\(\)/);
});

test("deleteSession clears session-owned tables after stopping stale running state", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const row: NDXSessionRow = {
    sessionid: "018f0000-0000-7000-8000-000000000000",
    userid: "ndev",
    title: "삭제 대상",
    mode: "none",
    path: "/ndx/workspace",
    projectid: "project-1",
    model: modelConfig(),
    isrunning: true,
    turnphase: "tool_execution",
    interruptrequested: false,
    interruptrequestedat: null,
    interruptcompletedat: null,
    lastupdated: new Date("2026-05-12T00:00:00.000Z")
  };
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      if (/SELECT sessionid/.test(text)) {
        return { rows: [row], rowCount: 1 } as never;
      }
      if (/interruptrequested = true/.test(text)) {
        row.interruptrequested = true;
        return { rows: [row], rowCount: 1 } as never;
      }
      if (/interruptrequested = false/.test(text)) {
        row.isrunning = false;
        row.interruptrequested = false;
        return { rows: [row], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 1 } as never;
    },
    async close() {}
  };

  const deleted = await deleteSession(database, row.sessionid, { waitTimeoutMs: 500, pollIntervalMs: 1 });

  assert.equal(deleted?.sessionid, row.sessionid);
  assert.match(queries[1].text, /interruptrequested = true/);
  assert.match(queries.at(-1)?.text ?? "", /DELETE FROM sessiontoken/);
  assert.match(queries.at(-1)?.text ?? "", /DELETE FROM sessiondata/);
  assert.match(queries.at(-1)?.text ?? "", /DELETE FROM "session"/);
  assert.deepEqual(queries.at(-1)?.values, [row.sessionid]);
});
