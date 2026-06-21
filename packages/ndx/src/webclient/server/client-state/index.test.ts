import assert from "node:assert/strict";
import test from "node:test";
import {
  WEB_CLIENT_STATE_TABLE_SQL,
  WEB_PROJECT_TABLE_SQL,
  createInitialWebClientState,
  initWebClientStateDatabase,
  isAbsoluteProjectPath,
  listWebProject,
  normalizeWebClientState,
  upsertWebClientState,
  upsertWebProject
} from "./index.js";
import type { NDXWebClientStateDatabase } from "./schema.js";

test("web client state schema defines a dedicated pgvector-backed table", () => {
  assert.match(WEB_CLIENT_STATE_TABLE_SQL, /CREATE TABLE IF NOT EXISTS webclientstate/);
  assert.match(WEB_CLIENT_STATE_TABLE_SQL, /clientid uuid PRIMARY KEY/);
  assert.doesNotMatch(WEB_CLIENT_STATE_TABLE_SQL, /userid text/);
  assert.match(WEB_CLIENT_STATE_TABLE_SQL, /state jsonb NOT NULL/);
  assert.match(WEB_PROJECT_TABLE_SQL, /projectname text PRIMARY KEY/);
  assert.doesNotMatch(WEB_PROJECT_TABLE_SQL, /\n  path text/);
  assert.doesNotMatch(WEB_PROJECT_TABLE_SQL, /\n  target text/);
});

test("initWebClientStateDatabase runs table and index SQL", async () => {
  const queries: string[] = [];
  const database: NDXWebClientStateDatabase = {
    async query(text) {
      queries.push(text);
      return { rows: [], rowCount: 0 } as never;
    }
  };

  await initWebClientStateDatabase(database);

  assert.equal(queries.length, 5);
  assert.equal(queries[0], WEB_CLIENT_STATE_TABLE_SQL);
});

test("normalizeWebClientState keeps only valid local projects", () => {
  const state = normalizeWebClientState({
    locale: "en",
    projects: [
      { id: "project-1", name: " NDX ", path: " /mnt/f/dev/ndx2 ", source: "local", screenorder: 1 },
      { id: "project-3", name: "Newer", path: "/mnt/f/dev/newer", source: "local", screenorder: 3 },
      { id: "project-1", name: "duplicate", path: "/duplicate", source: "local" },
      { id: "project-2", name: "hidden", path: "/hidden", source: "local", isactive: false },
      { id: "broken", name: "", path: "", source: "local" }
    ],
    activeProjectName: "project-1"
  });

  assert.equal(state.locale, "en");
  assert.deepEqual(state.projects, [
    {
      projectName: "broken",
      name: "broken",
      path: "/ndx/workspace/broken",
      screenorder: 3,
      source: "local"
    },
    {
      projectName: "project-3",
      name: "Newer",
      path: "/mnt/f/dev/newer",
      screenorder: 3,
      source: "local"
    },
    {
      projectName: "project-2",
      name: "hidden",
      path: "/hidden",
      screenorder: 2,
      source: "local"
    },
    {
      projectName: "project-1",
      name: "NDX",
      path: "/mnt/f/dev/ndx2",
      screenorder: 1,
      source: "local"
    }
  ]);
  assert.equal(state.activeProjectName, "project-1");
});

test("web projects list newest screenorder first and upsert allocates next order", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXWebClientStateDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      if (queries.length === 1 && /SELECT projectname, screenorder, updatedat/i.test(text) && /FROM web_project/i.test(text)) {
        return { rows: [], rowCount: 0 } as never;
      }
      return {
        rows: [
          {
            projectname: values?.[0],
            screenorder: 3,
            updatedat: new Date("2026-05-12T00:00:00.000Z")
          }
        ],
        rowCount: 1
      } as never;
    }
  };

  await listWebProject(database);
  await upsertWebProject(database, { projectname: "project-1" });

  assert.match(queries[0].text, /FROM web_project/);
  assert.match(queries[0].text, /ORDER BY screenorder DESC, projectname ASC/);
  assert.match(queries[1].text, /COALESCE\(MAX\(screenorder\), -1\) \+ 1/);
  assert.equal(queries[1].values[1], null);
});

test("upsertWebClientState validates clientid and serializes normalized state", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXWebClientStateDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return {
        rows: [
          {
            clientid: values?.[0],
            state: JSON.parse(String(values?.[1])),
            updatedat: new Date("2026-05-12T00:00:00.000Z")
          }
        ],
        rowCount: 1
      } as never;
    }
  };

  const row = await upsertWebClientState(database, {
    clientid: "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5",
    state: createInitialWebClientState("ko")
  });

  assert.equal(row.clientid, "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5");
  assert.equal(row.state.locale, "ko");
  assert.match(queries[0].text, /ON CONFLICT \(clientid\)/);
  await assert.rejects(
    () => upsertWebClientState(database, { clientid: "bad", state: {} }),
    /clientid must be a uuid/
  );
});

test("isAbsoluteProjectPath accepts Unix, Windows drive, and UNC paths", () => {
  assert.equal(isAbsoluteProjectPath("/mnt/f/dev/ndx2"), true);
  assert.equal(isAbsoluteProjectPath("F:\\dev\\ndx2"), true);
  assert.equal(isAbsoluteProjectPath("\\\\server\\share"), true);
  assert.equal(isAbsoluteProjectPath("ndx2"), false);
});
