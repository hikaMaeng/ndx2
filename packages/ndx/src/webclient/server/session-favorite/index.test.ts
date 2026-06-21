import assert from "node:assert/strict";
import test from "node:test";
import {
  WEB_SESSION_FAVORITE_TABLE_INDEX_SQL,
  WEB_SESSION_FAVORITE_TABLE_SQL,
  deleteWebSessionFavorite,
  initWebSessionFavoriteDatabase,
  listWebSessionFavorite,
  upsertWebSessionFavorite
} from "./index.js";
import type { NDXWebSessionFavoriteDatabase } from "./index.js";

test("web session favorite schema stores pinned project sessions separately", () => {
  assert.match(WEB_SESSION_FAVORITE_TABLE_SQL, /CREATE TABLE IF NOT EXISTS web_session_favorite/);
  assert.match(WEB_SESSION_FAVORITE_TABLE_SQL, /sessionid uuid PRIMARY KEY REFERENCES "session" \(sessionid\) ON DELETE CASCADE/);
  assert.match(WEB_SESSION_FAVORITE_TABLE_SQL, /pinnedat timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(WEB_SESSION_FAVORITE_TABLE_INDEX_SQL, /pinnedat DESC, sessionid DESC/);
});

test("initWebSessionFavoriteDatabase runs table then index SQL", async () => {
  const queries: string[] = [];
  const database: NDXWebSessionFavoriteDatabase = {
    async query(text) {
      queries.push(text);
      return { rows: [], rowCount: 0 } as never;
    }
  };

  await initWebSessionFavoriteDatabase(database);

  assert.deepEqual(queries, [WEB_SESSION_FAVORITE_TABLE_SQL, WEB_SESSION_FAVORITE_TABLE_INDEX_SQL]);
});

test("session favorites list newest pins first", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXWebSessionFavoriteDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 0 } as never;
    }
  };

  await listWebSessionFavorite(database);

  assert.match(queries[0].text, /FROM web_session_favorite f/);
  assert.match(queries[0].text, /WHERE s\.parentsessionid = s\.sessionid/);
  assert.match(queries[0].text, /ORDER BY f\.pinnedat DESC, f\.sessionid DESC/);
});

test("session favorite upsert refreshes pinned date and delete removes the pin", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXWebSessionFavoriteDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 1 } as never;
    }
  };

  await upsertWebSessionFavorite(database, "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5");
  const deleted = await deleteWebSessionFavorite(database, "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5");

  assert.match(queries[0].text, /ON CONFLICT \(sessionid\)/);
  assert.match(queries[0].text, /DO UPDATE SET pinnedat = now\(\)/);
  assert.equal(queries[0].values[0], "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5");
  assert.match(queries[1].text, /DELETE FROM web_session_favorite/);
  assert.equal(deleted, true);
});
