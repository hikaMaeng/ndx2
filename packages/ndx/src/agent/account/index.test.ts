import assert from "node:assert/strict";
import test from "node:test";
import {
  createUser,
  getUser,
  initAccountDatabase,
  listUser
} from "./index.js";
import { DEFAULT_NDX_USERID, DEFAULT_USER_RECORD_SQL, USERS_TABLE_SQL } from "./schema.js";
import type { NDXDatabase } from "../init/index.js";

test("users schema SQL defines account identity constraints", () => {
  assert.match(USERS_TABLE_SQL, /userid text PRIMARY KEY/);
  assert.doesNotMatch(USERS_TABLE_SQL, /CHECK/);
  assert.match(USERS_TABLE_SQL, /created timestamptz NOT NULL DEFAULT now\(\)/);
});

test("initAccountDatabase creates users and seeds the default account immediately", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  await initAccountDatabase(database);

  assert.equal(queries.length, 2);
  assert.equal(queries[0].text, USERS_TABLE_SQL);
  assert.equal(queries[1].text, DEFAULT_USER_RECORD_SQL);
  assert.deepEqual(queries[1].values, [DEFAULT_NDX_USERID]);
});

test("createUser inserts and returns the account row", async () => {
  const database: NDXDatabase = {
    async query(_text, values) {
      return { rows: [{ userid: values?.[0], created: new Date() }], rowCount: 1 } as never;
    },
    async close() {}
  };

  const user = await createUser(database, "사용자");

  assert.equal(user.userid, "사용자");
  assert.ok(user.created instanceof Date);
});

test("createUser validates userid policy at runtime", async () => {
  const database: NDXDatabase = {
    async query() {
      throw new Error("query must not run for invalid userid.");
    },
    async close() {}
  };

  await assert.rejects(() => createUser(database, ""), /1 to 200 Unicode characters/);
  await assert.rejects(() => createUser(database, "사용자 이름"), /no Unicode whitespace/);
  await assert.rejects(() => createUser(database, "가".repeat(201)), /1 to 200 Unicode characters/);
});

test("getUser selects by userid", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return { rows: [{ userid: values?.[0], created: new Date() }], rowCount: 1 } as never;
    },
    async close() {}
  };

  const user = await getUser(database, "ndev");

  assert.equal(user?.userid, "ndev");
  assert.deepEqual(queries[0].values, ["ndev"]);
});

test("listUser selects all users in stable order", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const created = new Date();
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return {
        rows: [
          { userid: "ndev", created },
          { userid: "사용자", created }
        ],
        rowCount: 2
      } as never;
    },
    async close() {}
  };

  const users = await listUser(database);

  assert.deepEqual(users.map((user) => user.userid), ["ndev", "사용자"]);
  assert.match(queries[0].text, /ORDER BY userid ASC/);
});
