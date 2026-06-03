import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_NDX_USERID, DEFAULT_USER_RECORD_SQL, USERS_TABLE_SQL, initAccountDatabase } from "../account/index.js";
import { SESSION_TABLE_SQL, initSessionDatabase } from "../session/index.js";
import { initSessionTokenDatabase } from "../session-token/index.js";
import { initWebClientStateDatabase } from "../../webclient/server/client-state/index.js";
import type { NDXDatabase } from "./index.js";

test("server database initialization creates the default account before session storage", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  await initAccountDatabase(database);
  await initSessionDatabase(database);
  await initSessionTokenDatabase(database);
  await initWebClientStateDatabase(database);

  assert.equal(queries[0].text, USERS_TABLE_SQL);
  assert.equal(queries[1].text, DEFAULT_USER_RECORD_SQL);
  assert.deepEqual(queries[1].values, [DEFAULT_NDX_USERID]);
  assert.equal(queries[2].text, SESSION_TABLE_SQL);
});
