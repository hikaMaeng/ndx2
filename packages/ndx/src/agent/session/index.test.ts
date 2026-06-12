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
  SESSIONSEARCH_TABLE_SQL,
  SESSIONSEARCH_TABLE_MIGRATION_SQL,
  SESSIONDATA_TABLE_SQL,
  appendSessionData,
  completeSessionInterrupt,
  createSession,
  deleteSession,
  initSessionDatabase,
  listSessionData,
  listSession,
  requestSessionInterrupt,
  recordSessionSearchFromSessionData,
  runSessionTurn,
  searchSessionHistory,
  sessionSearchText,
  sessionDataRowsToModelMessages,
  sessionRowsThroughTurn,
  sessionTurnRangeForInput,
  updateSessionEndTurn,
  updateSessionStartTurn,
  updateSessionTitle
} from "./index.js";
import { sessionDataRowsForModelContext } from "../compact/index.js";
import { writeSessionAttachments } from "./attachments.js";
import { createNDXHookRuntime } from "../hook/index.js";
import { requestRuntimeTurnInterrupt } from "../turnloop/index.js";
import { NDX_TURN_EVENT } from "../../common/protocol/index.js";
import type { NDXSessionDataRow, NDXSessionRow } from "./index.js";
import type { NDXDatabase } from "../init/index.js";

function modelConfig(model = "gpt-test") {
  return { type: "openai" as const, model, url: "https://example.test", token: "", contextsize: 200_000 };
}

function dataRow(dataid: string, type: string, contents: unknown): NDXSessionDataRow {
  return {
    dataid,
    sessionid: "018f0000-0000-7000-8000-000000000000",
    type,
    contents,
    createdat: new Date("2026-06-02T00:00:00.000Z")
  };
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
  assert.doesNotMatch(SESSION_TABLE_SQL, /slidewindow/);
  assert.match(SESSION_TABLE_SQL, /runtimedata jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(SESSION_TABLE_MIGRATION_SQL, /ADD COLUMN IF NOT EXISTS interruptrequested/);
  assert.match(SESSION_TABLE_MIGRATION_SQL, /DROP CONSTRAINT IF EXISTS session_slidewindow_range_check/);
  assert.match(SESSION_TABLE_MIGRATION_SQL, /DROP COLUMN IF EXISTS slidewindow/);
  assert.match(SESSION_TABLE_MIGRATION_SQL, /ADD COLUMN IF NOT EXISTS runtimedata jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(SESSIONDATA_TABLE_SQL, /sessionid uuid NOT NULL REFERENCES "session" \(sessionid\) ON DELETE CASCADE/);
  assert.match(SESSIONDATA_TABLE_SQL, /contents jsonb NOT NULL/);
  assert.match(SESSIONSEARCH_TABLE_SQL, /CREATE TABLE IF NOT EXISTS sessionsearch/);
  assert.match(SESSIONSEARCH_TABLE_SQL, /embedding vector\(4096\) NOT NULL/);
  assert.match(SESSIONSEARCH_TABLE_SQL, /hnsw vector\(256\) NOT NULL/);
  assert.match(SESSIONSEARCH_TABLE_MIGRATION_SQL, /ADD COLUMN IF NOT EXISTS hnsw vector\(256\)/);
  assert.match(SESSIONSEARCH_TABLE_SQL, /to_tsvector\(ndx_sessionsearch_regconfig\(\), NEW\."text"\)/);
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

  assert.equal(queries.length, 8);
  assert.equal(queries[0], SESSION_TABLE_SQL);
  assert.equal(queries[1], SESSION_TABLE_MIGRATION_SQL);
  assert.equal(queries[3], SESSIONDATA_TABLE_SQL);
  assert.equal(queries[5], SESSIONSEARCH_TABLE_SQL);
  assert.equal(queries[6], SESSIONSEARCH_TABLE_MIGRATION_SQL);
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
            projectname: values?.[4],
            model: JSON.parse(String(values?.[5])),
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
    projectname: "project-1",
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
            projectname: values?.[1],
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
  assert.match(queries[0].text, /WHERE userid = \$1\s+AND projectname = \$2/);
  assert.match(queries[0].text, /ORDER BY lastupdated DESC, sessionid DESC/);
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

test("appendSessionData promotes only user message text to title when attachments exist", async () => {
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

  await appendSessionData(database, "018f0000-0000-7000-8000-000000000000", "user", {
    kind: "user_message",
    text: "첨부 이미지 속 텍스트를 읽어줘.",
    attachments: [{ kind: "image", path: "/ndx/workspace/test/.ndx/sessions/018f0000-0000-7000-8000-000000000000/sample.png", name: "sample.png", mimeType: "image/png", size: 3 }]
  });

  assert.equal(queries[1].values[2], "첨부 이미지 속 텍스트를 읽어줘.");
});

test("sessionSearchText indexes only user requests and final assistant messages", () => {
  assert.equal(sessionSearchText({ type: "user", contents: { kind: "user_message", text: "질문" } }), "질문");
  assert.equal(sessionSearchText({ type: "assistant", contents: { kind: "assistant_message", text: "최종 답변" } }), "최종 답변");
  assert.equal(sessionSearchText({ type: "assistant", contents: { kind: "assistant_delta", content: "중간" } }), undefined);
  assert.equal(sessionSearchText({ type: "assistant", contents: { kind: "tool_result", results: [] } }), undefined);
});

test("session turn range starts at the selected user row and ends before the next user row", () => {
  const rows = [
    dataRow("1", "compact", { kind: "compact", text: "summary", sourceRowCount: 1, createdReason: "test" }),
    dataRow("2", "user", { kind: "user_message", text: "첫 요청" }),
    dataRow("3", "assistant", { kind: "assistant_delta", iteration: 1, delta: "중간", content: "중간" }),
    dataRow("4", "assistant", { kind: "assistant_message", text: "첫 답변" }),
    dataRow("5", "user", { kind: "user_message", text: "둘째 요청" })
  ];

  assert.deepEqual(sessionTurnRangeForInput(rows, "2")?.rows.map((row) => row.dataid), ["2", "3", "4"]);
  assert.deepEqual(sessionRowsThroughTurn(rows, "2")?.map((row) => row.dataid), ["1", "2", "3", "4"]);
  assert.equal(sessionTurnRangeForInput(rows, "3"), undefined);
});

test("recordSessionSearchFromSessionData updates embeddings through the active database", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-sessionsearch-embedding-"));
  await fs.mkdir(path.join(userHome, ".ndx"), { recursive: true });
  await fs.writeFile(path.join(userHome, ".ndx", "settings.json"), JSON.stringify({
    embeddings: {
      provider: "local",
      model: "embed-test",
      url: "http://127.0.0.1:9999/v1"
    }
  }));
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    requestedUrl = String(input);
    return {
      ok: true,
      json: async () => ({ data: [{ embedding: Array.from({ length: 300 }, (_value, index) => index + 1) }] })
    };
  }) as unknown as typeof fetch;
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 1 } as never;
    },
    async close() {}
  };

  try {
    await recordSessionSearchFromSessionData(database, {
      dataid: "12",
      sessionid: "018f0000-0000-7000-8000-000000000000",
      type: "user",
      contents: { kind: "user_message", text: "검색할 사용자 요청" },
      createdat: new Date("2026-05-31T00:00:00.000Z")
    }, userHome);
    await waitFor(() => queries.some((query) => /UPDATE sessionsearch/.test(query.text)));

    const update = queries.find((query) => /UPDATE sessionsearch/.test(query.text));
    assert.equal(requestedUrl, "http://127.0.0.1:9999/v1/embeddings");
    assert.equal(update?.values[0], "12");
    assert.equal(String(update?.values[1]).replace(/^\[|\]$/g, "").split(",").length, 4096);
    assert.equal(String(update?.values[2]).replace(/^\[|\]$/g, "").split(",").length, 256);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(userHome, { recursive: true, force: true });
  }
});

test("searchSessionHistory narrows by project before FTS ranking when embeddings are not configured", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-history-"));
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return {
        rows: [{
          dataid: "12",
          sessionid: "018f0000-0000-7000-8000-000000000000",
          projectname: "018f0000-0000-7000-8000-000000000001",
          path: "/repo",
          title: "이전 작업",
          type: "assistant",
          createdat: new Date("2026-05-31T00:00:00.000Z"),
          text: "검색 결과",
          tokenlength: 2,
          rank: 0.2
        }],
        rowCount: 1
      } as never;
    },
    async close() {}
  };

  const result = await searchSessionHistory(database, {
    userHome,
    scope: { type: "project", projectname: "018f0000-0000-7000-8000-000000000001" },
    query: "검색",
    limit: 5
  });

  assert.equal(result.mode, "fts");
  assert.equal(result.embedding.configured, false);
  assert.equal(result.results[0].score?.rank, 0.2);
  assert.match(queries[0].text, /WHERE s\.projectname = \$1/);
  assert.match(queries[0].text, /websearch_to_tsquery\(ndx_sessionsearch_regconfig\(\), \$2\)/);
  assert.deepEqual(queries[0].values, ["018f0000-0000-7000-8000-000000000001", "검색", 5]);
});

test("searchSessionHistory uses 256-dimension hnsw vector while preserving embedding settings", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-history-vector-"));
  await fs.mkdir(path.join(userHome, ".ndx"), { recursive: true });
  await fs.writeFile(path.join(userHome, ".ndx", "settings.json"), JSON.stringify({
    embeddings: {
      provider: "local",
      model: "embed-test",
      url: "http://127.0.0.1:9999/v1"
    }
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ data: [{ embedding: Array.from({ length: 300 }, (_value, index) => index + 1) }] })
  })) as unknown as typeof fetch;
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return {
        rows: [{
          dataid: "12",
          sessionid: "018f0000-0000-7000-8000-000000000000",
          projectname: "018f0000-0000-7000-8000-000000000001",
          path: "/repo",
          title: "이전 작업",
          type: "assistant",
          createdat: new Date("2026-05-31T00:00:00.000Z"),
          text: "검색 결과",
          tokenlength: 2,
          similarity: 0.8,
          rank: 0.2
        }],
        rowCount: 1
      } as never;
    },
    async close() {}
  };

  try {
    const result = await searchSessionHistory(database, {
      userHome,
      scope: { type: "project", projectname: "018f0000-0000-7000-8000-000000000001" },
      query: "검색",
      limit: 5
    });

    assert.equal(result.mode, "vector");
    assert.equal(result.embedding.used, true);
    assert.match(queries[0].text, /hnsw <=> \$3::vector\(256\)/);
    assert.doesNotMatch(queries[0].text, /embedding <=>/);
    assert.match(queries[0].text, /lexical_score/);
    assert.match(queries[0].text, /COALESCE\(similarity, 0\) \* 0\.65/);
    assert.equal(String(queries[0].values[2]).replace(/^\[|\]$/g, "").split(",").length, 256);
    assert.match(String(queries[0].values[2]), /^\[1,2,3,/);
    assert.match(String(queries[0].values[2]), /,256]$/);
    assert.deepEqual(queries[0].values[3], ["검색"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("searchSessionHistory boosts direct lexical matches in vector ranking", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-history-lexical-vector-"));
  await fs.mkdir(path.join(userHome, ".ndx"), { recursive: true });
  await fs.writeFile(path.join(userHome, ".ndx", "settings.json"), JSON.stringify({
    embeddings: {
      provider: "local",
      model: "embed-test",
      url: "http://127.0.0.1:9999/v1"
    }
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ data: [{ embedding: Array.from({ length: 300 }, (_value, index) => index + 1) }] })
  })) as unknown as typeof fetch;
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  try {
    await searchSessionHistory(database, {
      userHome,
      scope: { type: "project", projectname: "018f0000-0000-7000-8000-000000000001" },
      query: "deploy-report-begin status ok compose refreshed",
      limit: 5
    });

    assert.match(queries[0].text, /unnest\(\$4::text\[\]\) AS query_term/);
    assert.match(queries[0].text, /OR lexical_score >= 0\.2/);
    assert.match(queries[0].text, /lexical_score \* 0\.35/);
    assert.deepEqual(queries[0].values[3], ["deploy-report-begin", "status", "ok", "compose", "refreshed"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("searchSessionHistory uses embedding provider url from provider settings", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-history-provider-url-"));
  await fs.mkdir(path.join(userHome, ".ndx"), { recursive: true });
  await fs.writeFile(path.join(userHome, ".ndx", "settings.json"), JSON.stringify({
    providers: {
      local: {
        type: "openai",
        url: "http://192.168.65.254:12345/v1"
      }
    },
    embeddings: {
      provider: "local",
      model: "qwen3-embedding-8b:mp"
    }
  }));
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    requestedUrl = String(input);
    return {
      ok: true,
      json: async () => ({ data: [{ embedding: Array.from({ length: 300 }, (_value, index) => index + 1) }] })
    };
  }) as unknown as typeof fetch;
  const database: NDXDatabase = {
    async query() {
      return {
        rows: [],
        rowCount: 0
      } as never;
    },
    async close() {}
  };

  try {
    const result = await searchSessionHistory(database, {
      userHome,
      scope: { type: "project", projectname: "018f0000-0000-7000-8000-000000000001" },
      query: "검색",
      limit: 5
    });

    assert.equal(result.mode, "vector");
    assert.equal(requestedUrl, "http://192.168.65.254:12345/v1/embeddings");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listSessionData uses numeric append order from the sessiondata table column", async () => {
  const queries: string[] = [];
  const database: NDXDatabase = {
    async query(text) {
      queries.push(text);
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  await listSessionData(database, "018f0000-0000-7000-8000-000000000000");

  assert.match(queries[0], /FROM sessiondata/);
  assert.match(queries[0], /ORDER BY sessiondata\.dataid ASC/);
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
            projectname: "project-1",
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
    projectname: "project-1",
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
    await runSessionTurn(database, session, { text: "새 질문" });

    assert.deepEqual(insertedTypes, ["user", "assistant"]);
    assert.deepEqual(rows[2]?.contents, { kind: "user_message", text: "새 질문" });
    assert.deepEqual(rows[3]?.contents, { kind: "assistant_message", text: "모델 응답" });
    const visibleHistory = seenModelMessages
      .map((message) => message.content)
      .filter((content) => !content.includes("<environment_context>"))
      .slice(-3);
    assert.deepEqual(visibleHistory, ["이전 질문", "이전 답변", "새 질문"]);
    assert.ok(seenModelMessages.findIndex((message) => message.content.includes("<environment_context>")) < seenModelMessages.map((message) => message.content).lastIndexOf("이전 질문"));
  } finally {
    modelServer.close();
    await once(modelServer, "close");
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("runSessionTurn sends provider reasoning effort without inserting prompt control rows", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-reasoning-control-"));
  const modelInputs: unknown[] = [];
  const modelReasoning: unknown[] = [];
  const modelServer = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { input?: unknown; reasoning?: unknown };
      modelInputs.push(payload.input);
      modelReasoning.push(payload.reasoning);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "완료" }] }] }));
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
    projectname: "project-1",
    model: { ...modelConfig("test-model"), url: `http://127.0.0.1:${address.port}/v1`, reasoningEffort: "high" },
    isrunning: false,
    turnphase: "idle",
    interruptrequested: false,
    interruptrequestedat: null,
    interruptcompletedat: null,
    lastupdated: new Date("2026-05-12T00:00:00.000Z")
  };
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
    await runSessionTurn(database, session, { text: "새 질문" });

    assert.equal(rows[2]?.type, "user");
    assert.deepEqual(rows[2]?.contents, { kind: "user_message", text: "새 질문" });
    assert.equal(rows[3]?.type, "assistant");
    assert.deepEqual(modelReasoning[0], { effort: "high" });
    const input = String(modelInputs[0]);
    assert.ok(input.indexOf("이전 답변") < input.indexOf("새 질문"));
    assert.doesNotMatch(input, /<ndx_thinking_level>deep<\/ndx_thinking_level>/);
  } finally {
    modelServer.close();
    await once(modelServer, "close");
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("session data model reconstruction keeps cot_work reminders as durable user history", () => {
  const messages = sessionDataRowsToModelMessages([
    {
      dataid: "1",
      sessionid: "018f0000-0000-7000-8000-000000000010",
      type: "user",
      contents: { kind: "user_message", text: "작업해" },
      createdat: new Date("2026-05-12T00:00:01.000Z")
    },
    {
      dataid: "2",
      sessionid: "018f0000-0000-7000-8000-000000000010",
      type: "system",
      contents: { kind: "cot_work_reminder", iteration: 2, sourceDataId: "1", text: "cot_work reminder: keep going" },
      createdat: new Date("2026-05-12T00:00:02.000Z")
    }
  ]);

  assert.deepEqual(messages, [
    { role: "user", content: "작업해" },
    { role: "user", content: "cot_work reminder: keep going" }
  ]);
});

test("session data model reconstruction exposes preloaded skills as user context without tool output", () => {
  const skillText = "<skill>\n<name>demo</name>\n<path>/work/.ndx/skills/demo/SKILL.md</path>\nUse demo workflow.\n</skill>";
  const messages = sessionDataRowsToModelMessages([
    {
      dataid: "1",
      sessionid: "018f0000-0000-7000-8000-000000000010",
      type: "system",
      contents: { kind: "skill_context", name: "demo", path: "/work/.ndx/skills/demo/SKILL.md", text: skillText },
      createdat: new Date("2026-05-12T00:00:01.000Z")
    },
    {
      dataid: "2",
      sessionid: "018f0000-0000-7000-8000-000000000010",
      type: "user",
      contents: { kind: "user_message", text: "demo로 처리해" },
      createdat: new Date("2026-05-12T00:00:02.000Z")
    }
  ]);

  assert.deepEqual(messages, [
    { role: "user", content: skillText },
    { role: "user", content: "demo로 처리해" }
  ]);
  assert.equal(messages.some((message) => "type" in message && message.type === "function_call_output"), false);
});

test("session data model reconstruction exposes compact summaries as user history", () => {
  const messages = sessionDataRowsToModelMessages([
    {
      dataid: "10",
      sessionid: "018f0000-0000-7000-8000-000000000010",
      type: "compact",
      contents: { kind: "compact", text: "이전 대화 요약", sourceRowCount: 4, createdReason: "limit" },
      createdat: new Date("2026-05-12T00:00:01.000Z")
    },
    {
      dataid: "11",
      sessionid: "018f0000-0000-7000-8000-000000000010",
      type: "user",
      contents: { kind: "user_message", text: "이어 해줘" },
      createdat: new Date("2026-05-12T00:00:02.000Z")
    }
  ]);

  assert.deepEqual(messages, [
    { role: "user", content: "Session compact summary:\n이전 대화 요약" },
    { role: "user", content: "이어 해줘" }
  ]);
});

test("session data model reconstruction exposes reasoning control rows without treating them as user input rows", () => {
  const messages = sessionDataRowsToModelMessages([
    {
      dataid: "1",
      sessionid: "018f0000-0000-7000-8000-000000000010",
      type: "reasoning_control",
      contents: { kind: "tool_generated_user_message", text: "<ndx_thinking_level>deep</ndx_thinking_level>", sources: [{ tool: "thinking_level" }] },
      createdat: new Date("2026-05-12T00:00:01.000Z")
    },
    {
      dataid: "2",
      sessionid: "018f0000-0000-7000-8000-000000000010",
      type: "user",
      contents: { kind: "user_message", text: "깊게 검토해" },
      createdat: new Date("2026-05-12T00:00:02.000Z")
    }
  ]);

  assert.deepEqual(messages, [
    { role: "user", content: "<ndx_thinking_level>deep</ndx_thinking_level>" },
    { role: "user", content: "깊게 검토해" }
  ]);
});

test("session model context rows start at latest compact without manual trimming", () => {
  const rows: NDXSessionDataRow[] = [
    { dataid: "1", sessionid: "018f0000-0000-7000-8000-000000000010", type: "user", contents: { kind: "user_message", text: "old request" }, createdat: new Date("2026-05-12T00:00:01.000Z") },
    { dataid: "2", sessionid: "018f0000-0000-7000-8000-000000000010", type: "assistant", contents: { kind: "assistant_message", text: "old answer" }, createdat: new Date("2026-05-12T00:00:02.000Z") },
    { dataid: "3", sessionid: "018f0000-0000-7000-8000-000000000010", type: "compact", contents: { kind: "compact", text: "summary", sourceRowCount: 2, createdReason: "limit" }, createdat: new Date("2026-05-12T00:00:03.000Z") },
    { dataid: "4", sessionid: "018f0000-0000-7000-8000-000000000010", type: "user", contents: { kind: "user_message", text: "request 1" }, createdat: new Date("2026-05-12T00:00:04.000Z") },
    { dataid: "5", sessionid: "018f0000-0000-7000-8000-000000000010", type: "assistant", contents: { kind: "assistant_message", text: "answer 1" }, createdat: new Date("2026-05-12T00:00:05.000Z") },
    { dataid: "6", sessionid: "018f0000-0000-7000-8000-000000000010", type: "user", contents: { kind: "tool_generated_user_message", text: "synthetic user" }, createdat: new Date("2026-05-12T00:00:06.000Z") },
    { dataid: "10", sessionid: "018f0000-0000-7000-8000-000000000010", type: "user", contents: { kind: "user_message", text: "request 2" }, createdat: new Date("2026-05-12T00:00:10.000Z") },
    { dataid: "20", sessionid: "018f0000-0000-7000-8000-000000000010", type: "user", contents: { kind: "user_message", text: "request 3" }, createdat: new Date("2026-05-12T00:00:20.000Z") }
  ];

  assert.deepEqual(sessionDataRowsForModelContext(rows).map((row) => row.dataid), ["3", "4", "5", "6", "10", "20"]);
});

test("session data model reconstruction preserves interrupted assistant text after tool iterations", () => {
  const messages = sessionDataRowsToModelMessages([
    {
      dataid: "1",
      sessionid: "018f0000-0000-7000-8000-000000000011",
      type: "user",
      contents: { kind: "user_message", text: "작업해" },
      createdat: new Date("2026-05-12T00:00:01.000Z")
    },
    {
      dataid: "2",
      sessionid: "018f0000-0000-7000-8000-000000000011",
      type: "assistant",
      contents: { kind: "assistant_delta", iteration: 1, delta: "부분 응답", content: "부분 응답" },
      createdat: new Date("2026-05-12T00:00:02.000Z")
    },
    {
      dataid: "3",
      sessionid: "018f0000-0000-7000-8000-000000000011",
      type: "tool_call",
      contents: { kind: "tool_call", iteration: 1, toolCalls: [{ type: "function_call", call_id: "call_1", name: "read_file", arguments: "{}" }] },
      createdat: new Date("2026-05-12T00:00:03.000Z")
    },
    {
      dataid: "4",
      sessionid: "018f0000-0000-7000-8000-000000000011",
      type: "interrupt",
      contents: { kind: "interrupt", requestedAt: "2026-05-12T00:00:04.000Z" },
      createdat: new Date("2026-05-12T00:00:04.000Z")
    },
    {
      dataid: "5",
      sessionid: "018f0000-0000-7000-8000-000000000011",
      type: "assistant",
      contents: { kind: "assistant_message", text: "부분 응답" },
      createdat: new Date("2026-05-12T00:00:05.000Z")
    }
  ]);

  assert.deepEqual(messages, [
    { role: "user", content: "작업해" },
    { type: "function_call", call_id: "call_1", name: "read_file", arguments: "{}" },
    { role: "assistant", content: "부분 응답" }
  ]);
});

test("runSessionTurn rebuilds tool continuation from sessiondata before the next model request", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-tool-turn-"));
  const previousWorkspace = process.env.NDX_CONTAINER_WORKSPACE;
  process.env.NDX_CONTAINER_WORKSPACE = path.dirname(projectPath);
  const projectName = path.basename(projectPath);
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
    projectname: projectName,
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
  let inlineAttachmentDataIds: string[] = [];
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
      if (/jsonb_set/i.test(text) && /inlineAttachmentDataIds/i.test(String(values?.[2]))) {
        inlineAttachmentDataIds = [...inlineAttachmentDataIds, ...(JSON.parse(String(values?.[3])) as string[])];
        return { rows: [], rowCount: 1 } as never;
      }
      if (/SELECT COALESCE\(runtimedata->\$2/i.test(text)) {
        return { rows: [{ ids: inlineAttachmentDataIds }], rowCount: 1 } as never;
      }
      if (/SET\s+runtimedata = COALESCE\(runtimedata/i.test(text)) {
        const ids = inlineAttachmentDataIds;
        inlineAttachmentDataIds = [];
        return { rows: ids.length ? [{ ids }] : [], rowCount: ids.length ? 1 : 0 } as never;
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
    await runSessionTurn(database, session, { text: "도구를 써라" });

    assert.equal(modelInputs.length, 2);
    assert.ok(rows.some((row) => row.contents && typeof row.contents === "object" && (row.contents as { kind?: unknown }).kind === "tool_call"));
    assert.ok(rows.some((row) => row.contents && typeof row.contents === "object" && (row.contents as { kind?: unknown }).kind === "tool_result"));
    const secondInput = JSON.stringify(modelInputs[1]);
    assert.match(secondInput, /assistant function_call echo_value \(call_echo_1\)/);
    assert.match(secondInput, /tool result \(call_echo_1\)/);
    assert.match(secondInput, /tool:abc/);
  } finally {
    if (previousWorkspace === undefined) delete process.env.NDX_CONTAINER_WORKSPACE;
    else process.env.NDX_CONTAINER_WORKSPACE = previousWorkspace;
    modelServer.close();
    await once(modelServer, "close");
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("runSessionTurn records cancelled tool outputs before completing an interrupted tool turn", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-interrupt-tool-turn-"));
  const previousWorkspace = process.env.NDX_CONTAINER_WORKSPACE;
  process.env.NDX_CONTAINER_WORKSPACE = path.dirname(projectPath);
  const projectName = path.basename(projectPath);
  await fs.mkdir(path.join(projectPath, ".ndx", "tools", "hang"), { recursive: true });
  await fs.writeFile(
    path.join(projectPath, ".ndx", "tools", "hang", "tool.json"),
    JSON.stringify({
      tool: { command: process.execPath, args: ["./index.mjs"] },
      schema: {
        type: "function",
        name: "hang",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      }
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(projectPath, ".ndx", "tools", "hang", "index.mjs"),
    "process.stdout.write(JSON.stringify({ type: 'progress', message: 'running' }) + '\\n');\nsetInterval(() => {}, 1000);\n",
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
      response.end(JSON.stringify({
        output: [{ type: "function_call", call_id: "call_hang_1", name: "hang", arguments: "{}" }]
      }));
    });
  });

  await new Promise<void>((resolve) => {
    modelServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = modelServer.address();
  assert(address && typeof address === "object");

  const session: NDXSessionRow = {
    sessionid: "018f0000-0000-7000-8000-000000000012",
    userid: "ndev",
    title: "",
    mode: "none",
    path: projectPath,
    projectname: projectName,
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
      if (/SELECT COALESCE\(runtimedata->\$2/i.test(text)) {
        return { rows: [{ ids: [] }], rowCount: 1 } as never;
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
        session.turnphase = "idle";
        session.interruptrequested = false;
        return { rows: [session], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  try {
    await runSessionTurn(database, session, { text: "멈출 도구를 실행해" }, undefined, {
      async onEvent(event) {
        if (event.type === NDX_TURN_EVENT.ToolProgress && event.status === "progress") {
          requestRuntimeTurnInterrupt(session.sessionid);
        }
      }
    });

    assert.equal(modelInputs.length, 1);
    const toolResult = rows.find((row) => row.contents && typeof row.contents === "object" && (row.contents as { kind?: unknown }).kind === "tool_result");
    assert.ok(toolResult);
    assert.deepEqual((toolResult.contents as { results: Array<{ toolCallId: string; success: boolean }> }).results.map((result) => ({
      toolCallId: result.toolCallId,
      success: result.success
    })), [{ toolCallId: "call_hang_1", success: false }]);
    const messages = sessionDataRowsToModelMessages(rows);
    const toolCallIndex = messages.findIndex((message) => {
      const record = message as Record<string, unknown>;
      return record.type === "function_call" && record.call_id === "call_hang_1";
    });
    const outputIndex = messages.findIndex((message) => {
      const record = message as Record<string, unknown>;
      return record.type === "function_call_output" && record.call_id === "call_hang_1";
    });
    assert.ok(toolCallIndex >= 0);
    assert.ok(outputIndex > toolCallIndex);
  } finally {
    if (previousWorkspace === undefined) delete process.env.NDX_CONTAINER_WORKSPACE;
    else process.env.NDX_CONTAINER_WORKSPACE = previousWorkspace;
    modelServer.close();
    await once(modelServer, "close");
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("runSessionTurn appends tool-generated image input and inlines it on the next model request", async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-image-tool-turn-"));
  const previousWorkspace = process.env.NDX_CONTAINER_WORKSPACE;
  process.env.NDX_CONTAINER_WORKSPACE = path.dirname(projectPath);
  const projectName = path.basename(projectPath);
  const imagePath = path.join(projectPath, "sample.png");
  await fs.mkdir(path.join(projectPath, ".ndx", "tools", "image_effect"), { recursive: true });
  await fs.writeFile(imagePath, Buffer.from([1, 2, 3]));
  await fs.writeFile(
    path.join(projectPath, ".ndx", "tools", "image_effect", "tool.json"),
    JSON.stringify({
      tool: { command: process.execPath, args: ["./index.mjs", imagePath] },
      schema: {
        type: "function",
        name: "image_effect",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      }
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(projectPath, ".ndx", "tools", "image_effect", "index.mjs"),
    [
      "const imagePath = process.argv[2];",
      "process.stdout.write(JSON.stringify({",
      "  type: 'result',",
      "  success: true,",
      "  output: 'image queued',",
      "  effects: [",
      "    { type: 'append_user_message', text: 'Tool image input', attachments: [{ kind: 'image', path: imagePath, name: 'sample.png', mimeType: 'image/png', size: 3 }] },",
      "    { type: 'inline_appended_user_message' }",
      "  ]",
      "}) + '\\n');"
    ].join("\n"),
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
          output: [{ type: "function_call", call_id: "call_image_1", name: "image_effect", arguments: "{}" }]
        }));
        return;
      }
      response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "이미지 확인" }] }] }));
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
    projectname: projectName,
    model: { ...modelConfig("test-model"), modalities: ["text", "image"] },
    isrunning: false,
    turnphase: "idle",
    interruptrequested: false,
    interruptrequestedat: null,
    interruptcompletedat: null,
    lastupdated: new Date("2026-05-12T00:00:00.000Z")
  };
  session.model.url = `http://127.0.0.1:${address.port}/v1`;
  const rows: NDXSessionDataRow[] = [];
  let inlineAttachmentDataIds: string[] = [];
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
      if (/jsonb_set/i.test(text) && /inlineAttachmentDataIds/i.test(String(values?.[2]))) {
        inlineAttachmentDataIds = [...inlineAttachmentDataIds, ...(JSON.parse(String(values?.[3])) as string[])];
        return { rows: [], rowCount: 1 } as never;
      }
      if (/SELECT COALESCE\(runtimedata->\$2/i.test(text)) {
        return { rows: [{ ids: inlineAttachmentDataIds }], rowCount: 1 } as never;
      }
      if (/SET\s+runtimedata = COALESCE\(runtimedata/i.test(text)) {
        const ids = inlineAttachmentDataIds;
        inlineAttachmentDataIds = [];
        return { rows: ids.length ? [{ ids }] : [], rowCount: ids.length ? 1 : 0 } as never;
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
    await runSessionTurn(database, session, { text: "이미지를 가져와" });

    assert.equal(modelInputs.length, 2);
    assert.ok(rows.some((row) => row.contents && typeof row.contents === "object" && (row.contents as { kind?: unknown }).kind === "tool_result"));
    assert.ok(rows.some((row) => row.contents && typeof row.contents === "object" && (row.contents as { kind?: unknown }).kind === "tool_generated_user_message"));
    assert.match(JSON.stringify(modelInputs[1]), /data:image\/png;base64,AQID/);
    assert.doesNotMatch(JSON.stringify(modelInputs[1]), /file_path/);
  } finally {
    if (previousWorkspace === undefined) delete process.env.NDX_CONTAINER_WORKSPACE;
    else process.env.NDX_CONTAINER_WORKSPACE = previousWorkspace;
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
    projectname: "project-1",
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
    projectname: "project-1",
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
  assert.doesNotMatch(queries.at(-1)?.text ?? "", new RegExp("session" + "token"));
  assert.match(queries.at(-1)?.text ?? "", /DELETE FROM sessiondata/);
  assert.match(queries.at(-1)?.text ?? "", /DELETE FROM "session"/);
  assert.deepEqual(queries.at(-1)?.values, [row.sessionid]);
});
