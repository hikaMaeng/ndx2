import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_NDX_USERID, DEFAULT_USER_RECORD_SQL, USERS_TABLE_SQL } from "../account/index.js";
import { PROJECT_TABLE_SQL } from "../project/index.js";
import { SESSION_TABLE_SQL } from "../session/index.js";
import { initServer } from "./index.js";
import type { NDXDatabase } from "./index.js";

test("initServer initializes the default account before session storage", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-init-user-"));
  const projectHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-init-project-"));
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  try {
    await initServer({ userHome, projectHome, database });
  } finally {
    await fs.rm(userHome, { recursive: true, force: true });
    await fs.rm(projectHome, { recursive: true, force: true });
  }

  assert.equal(queries[0].text, USERS_TABLE_SQL);
  assert.equal(queries[1].text, DEFAULT_USER_RECORD_SQL);
  assert.deepEqual(queries[1].values, [DEFAULT_NDX_USERID]);
  assert.equal(queries[2].text, PROJECT_TABLE_SQL);
  assert.equal(queries[4].text, SESSION_TABLE_SQL);
});
