import assert from "node:assert/strict";
import test from "node:test";
import {
  NDX_CHAT_ALLOWED_TOOL_NAMES,
  deleteChatFolder,
  ensureRootChatFolder,
  initChatDatabase,
  listChatFolder,
  listChatSessionData,
  updateChatFolderTitle
} from "./index.js";
import {
  CHATFOLDER_TABLE_SQL,
  CHAT_TABLE_MIGRATION_SQL,
  CHATSESSIONDATA_TABLE_SQL,
  CHATSESSION_TABLE_SQL
} from "./schema.js";
import type { NDXDatabase } from "../init/index.js";

test("chat schema defines folder-scoped sessions and append-only history", () => {
  assert.match(CHATFOLDER_TABLE_SQL, /kind text NOT NULL DEFAULT 'normal' CHECK \(kind IN \('root', 'normal'\)\)/);
  assert.match(CHATSESSION_TABLE_SQL, /folderid uuid NOT NULL REFERENCES chatfolder \(folderid\) ON DELETE CASCADE/);
  assert.match(CHATSESSION_TABLE_SQL, /model jsonb NOT NULL CHECK/);
  assert.match(CHATSESSIONDATA_TABLE_SQL, /chatsessionid uuid NOT NULL REFERENCES chatsession \(chatsessionid\) ON DELETE CASCADE/);
});

test("initChatDatabase runs chat schema in dependency order", async () => {
  const queries: string[] = [];
  const database: NDXDatabase = {
    async query(text) {
      queries.push(text);
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  await initChatDatabase(database);

  assert.equal(queries[0], CHATFOLDER_TABLE_SQL);
  assert.equal(queries[1], CHATSESSION_TABLE_SQL);
  assert.equal(queries[2], CHAT_TABLE_MIGRATION_SQL);
  assert.equal(queries[5], CHATSESSIONDATA_TABLE_SQL);
});

test("ensureRootChatFolder inserts or returns the global root folder", async () => {
  const valuesSeen: unknown[][] = [];
  const database: NDXDatabase = {
    async query(_text, values) {
      valuesSeen.push(values ?? []);
      return {
        rows: [{ folderid: values?.[0], title: "root", kind: "root", screenorder: 0, createdat: new Date(), updatedat: new Date() }],
        rowCount: 1
      } as never;
    },
    async close() {}
  };

  const root = await ensureRootChatFolder(database);

  assert.equal(root.kind, "root");
  assert.match(String(valuesSeen[0][0]), /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("listChatFolder always ensures root before selecting folders", async () => {
  const queries: string[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push(text);
      if (/WITH inserted AS/i.test(text)) {
        return {
          rows: [{ folderid: values?.[0], title: "root", kind: "root", screenorder: 0, createdat: new Date(), updatedat: new Date() }],
          rowCount: 1
        } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  await listChatFolder(database);

  assert.match(queries[0], /INSERT INTO chatfolder/);
  assert.match(queries[1], /ORDER BY CASE WHEN kind = 'root' THEN 0 ELSE 1 END/);
});

test("root chat folder cannot be renamed or deleted through domain functions", async () => {
  const database: NDXDatabase = {
    async query(text) {
      assert.match(text, /kind <> 'root'/);
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  await assert.rejects(() => updateChatFolderTitle(database, "018f0000-0000-7000-8000-000000000000", "next"), /root folder cannot be renamed/);
  assert.equal(await deleteChatFolder(database, "018f0000-0000-7000-8000-000000000000"), undefined);
});

test("chat session data lists by numeric append order instead of text alias order", async () => {
  const queries: string[] = [];
  const database: NDXDatabase = {
    async query(text) {
      queries.push(text);
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  await listChatSessionData(database, "018f0000-0000-7000-8000-000000000000");

  assert.match(queries[0], /SELECT dataid::text AS dataid/);
  assert.match(queries[0], /ORDER BY chatsessiondata\.dataid ASC/);
});

test("chat tool policy exposes read/search/cot tools only", () => {
  assert.deepEqual([...NDX_CHAT_ALLOWED_TOOL_NAMES].sort(), [
    "cot_work",
    "getImage",
    "glob",
    "grep_search",
    "loadSkill",
    "read_file",
    "web_fetch",
    "web_search"
  ]);
  assert.equal(NDX_CHAT_ALLOWED_TOOL_NAMES.includes("bash" as never), false);
  assert.equal(NDX_CHAT_ALLOWED_TOOL_NAMES.includes("edit" as never), false);
  assert.equal(NDX_CHAT_ALLOWED_TOOL_NAMES.includes("write_file" as never), false);
});
