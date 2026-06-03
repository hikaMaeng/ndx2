import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSIONTOKEN_TABLE_SQL,
  createSessionToken,
  getSessionTokenGrant,
  initSessionTokenDatabase,
  pruneExpiredSessionTokens
} from "./index.js";
import type { NDXDatabase } from "../init/index.js";

test("session token schema stores runtime tokens for sessions", () => {
  assert.match(SESSIONTOKEN_TABLE_SQL, /token uuid PRIMARY KEY/);
  assert.match(SESSIONTOKEN_TABLE_SQL, /createdat timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(SESSIONTOKEN_TABLE_SQL, /sessionid uuid NOT NULL REFERENCES "session" \(sessionid\) ON DELETE CASCADE/);
});

test("initSessionTokenDatabase runs table and index SQL", async () => {
  const queries: string[] = [];
  const database: NDXDatabase = {
    async query(text) {
      queries.push(text);
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  await initSessionTokenDatabase(database);

  assert.equal(queries.length, 2);
  assert.equal(queries[0], SESSIONTOKEN_TABLE_SQL);
});

test("createSessionToken prunes expired rows before issuing uuid7 token", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const now = new Date("2026-05-15T00:00:00.000Z");
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      if (/INSERT INTO sessiontoken/i.test(text)) {
        return {
          rows: [{ token: values?.[0], createdat: new Date(String(values?.[1])), sessionid: values?.[2] }],
          rowCount: 1
        } as never;
      }
      return { rows: [], rowCount: 2 } as never;
    },
    async close() {}
  };

  const token = await createSessionToken(database, "018f0000-0000-7000-8000-000000000000", now);

  assert.match(queries[0].text, /DELETE FROM sessiontoken/);
  assert.match(queries[0].text, /interval '5 days'/);
  assert.match(token.token, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(token.createdat.toISOString(), now.toISOString());
  assert.equal(token.sessionid, "018f0000-0000-7000-8000-000000000000");
});

test("getSessionTokenGrant joins session owner and project fields", async () => {
  const database: NDXDatabase = {
    async query(text, values) {
      assert.match(text, /JOIN "session"/);
      assert.match(text, /interval '5 days'/);
      return {
        rows: [
          {
            token: values?.[0],
            createdat: new Date("2026-05-15T00:00:00.000Z"),
            sessionid: "018f0000-0000-7000-8000-000000000000",
            userid: "ndev",
            projectname: "project-1"
          }
        ],
        rowCount: 1
      } as never;
    },
    async close() {}
  };

  const grant = await getSessionTokenGrant(database, "018f0000-0000-7000-8000-000000000001");

  assert.equal(grant?.userid, "ndev");
  assert.equal(grant?.projectname, "project-1");
});

test("pruneExpiredSessionTokens uses the five day policy", async () => {
  const database: NDXDatabase = {
    async query(text) {
      assert.match(text, /createdat < \$1::timestamptz - interval '5 days'/);
      return { rows: [], rowCount: 3 } as never;
    },
    async close() {}
  };

  assert.equal(await pruneExpiredSessionTokens(database, new Date("2026-05-15T00:00:00.000Z")), 3);
});
