import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeToolCalls } from "./index.js";
import { NDX_SIDEBAR_ITEM_AGENTCALL_NAME } from "./execute/agentcall/index.js";
import type { NDXSessionRow } from "../session/index.js";
import type { NDXDatabase } from "../init/index.js";
import type { NDXToolExecutionOptions, NDXToolExecutionResult } from "./index.js";

test("glob supports session-observed brace, recursive, and virtual-root path patterns", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-glob-session-patterns-"));
  const userHome = path.join(root, "ndx");
  const projectHome = path.join(userHome, "workspace", "test1");
  await fs.mkdir(path.join(projectHome, "apps", "tetris", "src", "front", "components", "piece-preview"), { recursive: true });
  await fs.mkdir(path.join(projectHome, "apps", "tetris", "src", "front", "components", "ui"), { recursive: true });
  await fs.mkdir(path.join(projectHome, "apps", "tetris", "src", "server"), { recursive: true });
  await fs.mkdir(path.join(projectHome, "packages", "tetris_domain", "src", "common"), { recursive: true });
  await fs.mkdir(path.join(projectHome, ".ndx", "sessions", "session-1"), { recursive: true });
  await fs.writeFile(path.join(projectHome, "apps", "tetris", "src", "front", "TetrisGame.tsx"), "export function TetrisGame() {}\n", "utf8");
  await fs.writeFile(path.join(projectHome, "apps", "tetris", "src", "front", "components", "NextPiecePreview.tsx"), "export function NextPiecePreview() {}\n", "utf8");
  await fs.writeFile(path.join(projectHome, "apps", "tetris", "src", "front", "components", "piece-preview", "definitions.ts"), "export const definitions = {};\n", "utf8");
  await fs.writeFile(path.join(projectHome, "apps", "tetris", "src", "front", "components", "piece-preview", "canvas.tsx"), "export function Canvas() {}\n", "utf8");
  await fs.writeFile(path.join(projectHome, "apps", "tetris", "src", "front", "components", "ui", "button.tsx"), "export function Button() {}\n", "utf8");
  await fs.writeFile(path.join(projectHome, "apps", "tetris", "src", "server", "app.ts"), "export const app = true;\n", "utf8");
  await fs.writeFile(path.join(projectHome, "apps", "tetris", "package.json"), "{\"name\":\"tetris\"}\n", "utf8");
  await fs.writeFile(path.join(projectHome, "packages", "tetris_domain", "src", "common", "piece.ts"), "export const piece = true;\n", "utf8");
  await fs.writeFile(path.join(projectHome, "packages", "tetris_domain", "src", "common", "board.ts"), "export const board = true;\n", "utf8");
  await fs.writeFile(path.join(projectHome, ".ndx", "sessions", "session-1", "probe.png"), "png", "utf8");

  const cases = [
    { pattern: "**/*.{ts,tsx,js,jsx,json,yml,yaml,css}", path: "/workspace/test1", includes: ["apps/tetris/src/front/TetrisGame.tsx", "apps/tetris/package.json"] },
    { pattern: "apps/tetris/src/**/*.{ts,tsx}", path: "/ndx/workspace/test1", includes: ["apps/tetris/src/front/TetrisGame.tsx", "apps/tetris/src/server/app.ts"] },
    { pattern: "apps/tetris/src/**/*.{ts,tsx}", path: "/ndx/workspace/test1/apps/tetris", includes: ["apps/tetris/src/front/components/piece-preview/definitions.ts"] },
    { pattern: "**/*.{ts,tsx}", path: "packages/tetris_domain/src", includes: ["packages/tetris_domain/src/common/board.ts", "packages/tetris_domain/src/common/piece.ts"] },
    { pattern: "**/piece.ts", path: ".", includes: ["packages/tetris_domain/src/common/piece.ts"] },
    { pattern: "apps/tetris/src/front/components/piece-preview/**", path: ".", includes: ["apps/tetris/src/front/components/piece-preview/canvas.tsx"] },
    { pattern: "apps/tetris/src/front/components/ui/*", path: ".", includes: ["apps/tetris/src/front/components/ui/button.tsx"] },
    { pattern: "**/*.tsx", path: "/workspace/test1/apps/tetris/src/front", includes: ["apps/tetris/src/front/TetrisGame.tsx"] },
    { pattern: "*.png", path: "workspace/test1/.ndx/sessions/session-1", includes: [".ndx/sessions/session-1/probe.png"] },
    { pattern: "**/*.{ts,tsx}", path: "workspace/test1/workspace/test1", includes: ["apps/tetris/src/front/components/NextPiecePreview.tsx"] }
  ];

  for (const item of cases) {
    const result = await executeToolCall({ name: "glob", arguments: JSON.stringify({ pattern: item.pattern, path: item.path, limit: 500 }) }, { userHome, projectHome });
    assert.equal(result.success, true, `${item.pattern} under ${item.path}: ${result.output}`);
    const output = JSON.parse(result.output) as { files: string[]; count: number };
    const relativeFiles = output.files.map((file) => file.slice(projectHome.length + 1).split(path.sep).join("/"));
    for (const expected of item.includes) {
      assert.ok(relativeFiles.includes(expected), `${item.pattern} under ${item.path} should include ${expected}, got ${relativeFiles.join(", ")}`);
    }
    assert.ok(output.count >= item.includes.length);
  }
});

test("grep_search glob filter supports brace alternatives", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-grep-brace-glob-"));
  const userHome = path.join(root, "ndx");
  const projectHome = path.join(userHome, "workspace", "project");
  await fs.mkdir(path.join(projectHome, "src"), { recursive: true });
  await fs.writeFile(path.join(projectHome, "src", "component.tsx"), "const NextPiece = true;\n", "utf8");
  await fs.writeFile(path.join(projectHome, "src", "logic.ts"), "const NextPiece = true;\n", "utf8");
  await fs.writeFile(path.join(projectHome, "src", "notes.md"), "NextPiece should not match\n", "utf8");

  const result = await executeToolCall(
    { name: "grep_search", arguments: JSON.stringify({ pattern: "NextPiece", path: "src", glob: "**/*.{ts,tsx}", limit: 10 }) },
    { userHome, projectHome }
  );

  assert.equal(result.success, true);
  const output = JSON.parse(result.output) as { matches: Array<{ path: string }> };
  assert.deepEqual(output.matches.map((match) => path.basename(match.path)).sort(), ["component.tsx", "logic.ts"]);
});

test("grep_search supports JavaScript alternation, spaces in filenames, and generated-directory skips", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-grep-search-"));
  const userHome = path.join(root, "ndx");
  const projectHome = path.join(userHome, "workspace", "project");
  await fs.mkdir(path.join(projectHome, "src"), { recursive: true });
  await fs.writeFile(path.join(projectHome, "src", "with space.ts"), "const shape = 1;\nconst NextPiece = 2;\nconst nextShape = 3;\n", "utf8");

  const grep = await executeToolCall(
    { name: "grep_search", arguments: JSON.stringify({ pattern: "NextPiece|shape", path: "src", glob: "*.ts", limit: 2 }) },
    { userHome, projectHome }
  );

  assert.equal(grep.success, true);
  const output = JSON.parse(grep.output) as { matches: Array<{ line: number }>; truncated: boolean };
  assert.deepEqual(output.matches.map((match) => match.line), [1, 2]);
  assert.equal(output.truncated, true);

  await fs.mkdir(path.join(projectHome, "dist"), { recursive: true });
  await fs.writeFile(path.join(projectHome, "dist", "bundle.js"), "bundleOnly\n", "utf8");
  const generatedOutputGrep = await executeToolCall(
    { name: "grep_search", arguments: JSON.stringify({ pattern: "bundleOnly", path: "." }) },
    { userHome, projectHome }
  );

  assert.equal(generatedOutputGrep.success, true);
  assert.equal(JSON.parse(generatedOutputGrep.output).count, 0);
});

test("grep_search rejects invalid JavaScript regular expressions", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-grep-search-"));
  const userHome = path.join(root, "ndx");
  const projectHome = path.join(userHome, "workspace", "project");
  await fs.mkdir(projectHome, { recursive: true });

  const grep = await executeToolCall(
    { name: "grep_search", arguments: JSON.stringify({ pattern: "[", path: "." }) },
    { userHome, projectHome }
  );

  assert.equal(grep.success, false);
  assert.match(grep.output, /invalid JavaScript regular expression/);
});

test("session_history defaults to project scope and exposes search diagnostics in sidebar", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-history-tool-"));
  const queries: { text: string; values: unknown[] }[] = [];
  const sidebarItems: unknown[] = [];
  const result = await executeToolCall(
    { call_id: "history_project_default_1", name: "session_history", arguments: JSON.stringify({ query: "NextPiecePre", limit: 3 }) },
    {
      userHome,
      sessionid: SESSION.sessionid,
      session: SESSION,
      agentCallHandlers: {
        [NDX_SIDEBAR_ITEM_AGENTCALL_NAME]: (input: unknown) => {
          sidebarItems.push(input);
        }
      },
      database: databaseWithRows(queries, [{
        dataid: "4",
        sessionid: SESSION.sessionid,
        type: "assistant",
        createdat: new Date("2026-05-31T00:00:00.000Z"),
        text: "NextPiecePreview 수정 내용",
        tokenlength: 3,
        lexical_score: 1
      }])
    }
  );

  assert.equal(result.success, true);
  const output = JSON.parse(result.output) as { mode: string; scope: { type: string }; results: Array<{ score?: { lexical?: number } }> };
  assert.equal(output.mode, "fts");
  assert.equal(output.scope.type, "project");
  assert.equal(output.results[0].score?.lexical, 1);
  assert.match(queries[0]?.text ?? "", /WHERE s\.projectname = \$1/);
  assert.deepEqual(queries[0]?.values, [SESSION.projectname, "NextPiecePre", ["nextpiecepre"], 3]);
  assert.match((sidebarItems[0] as { body?: string }).body ?? "", /1개 결과 · project · fts/);
});

test("session_history FTS mode uses lexical prefix fallback for code identifiers", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-history-prefix-"));
  const queries: { text: string; values: unknown[] }[] = [];
  const database = databaseWithRows(queries, [{
    dataid: "15",
    sessionid: SESSION.sessionid,
    projectname: SESSION.projectname,
    title: "이전 작업",
    type: "assistant",
    createdat: new Date("2026-05-31T00:00:00.000Z"),
    text: "NextPiecePreview 수정 내용",
    tokenlength: 2,
    rank: 0,
    lexical_score: 1
  }]);

  const result = await executeToolCall(
    { name: "session_history", arguments: JSON.stringify({ scope: "project", query: "NextPiecePre", limit: 5 }) },
    { userHome, sessionid: SESSION.sessionid, session: SESSION, database }
  );

  assert.equal(result.success, true);
  const output = JSON.parse(result.output) as { mode: string; results: Array<{ score?: { lexical?: number } }> };
  assert.equal(output.mode, "fts");
  assert.equal(output.results[0].score?.lexical, 1);
  assert.match(queries[0]?.text ?? "", /lower\("text"\) LIKE '%' \|\| query_term\.value \|\| '%'/);
  assert.deepEqual(queries[0]?.values, [SESSION.projectname, "NextPiecePre", ["nextpiecepre"], 5]);
});

const SESSION: NDXSessionRow = {
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
};

function databaseWithRows(queries: { text: string; values: unknown[] }[], rows: Record<string, unknown>[]): NDXDatabase {
  return {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return { rows, rowCount: rows.length } as never;
    },
    async close() {}
  };
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
