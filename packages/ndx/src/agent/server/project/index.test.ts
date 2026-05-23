import assert from "node:assert/strict";
import test from "node:test";
import { ensureProject, PROJECT_TABLE_SQL } from "./index.js";
import type { NDXDatabase } from "../init/database.js";

test("project schema uses target and path as the composite primary key", () => {
  assert.match(PROJECT_TABLE_SQL, /projectid uuid NOT NULL UNIQUE/);
  assert.match(PROJECT_TABLE_SQL, /PRIMARY KEY \(target, path\)/);
  assert.match(PROJECT_TABLE_SQL, /CHECK \(target IN \('local'\)\)/);
});

test("ensureProject inserts only when target and path do not already exist", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return {
        rows: [
          {
            projectid: values?.[0],
            target: values?.[1],
            path: values?.[2],
            title: values?.[3]
          }
        ],
        rowCount: 1
      } as never;
    },
    async close() {}
  };

  const project = await ensureProject(database, { path: "F:\\dev\\ndx2", target: "local" });

  assert.match(project.projectid, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(project.path, "/mnt/f/dev/ndx2");
  assert.match(queries[0].text, /ON CONFLICT \(target, path\) DO NOTHING/);
  assert.equal(queries[0].values[1], "local");
  assert.equal(queries[0].values[2], "/mnt/f/dev/ndx2");
  assert.equal(queries[0].values[3], "");
});
