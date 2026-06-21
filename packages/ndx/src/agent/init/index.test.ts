import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SESSION_TABLE_SQL, initSessionDatabase } from "../session/schema.js";
import { initWebClientStateDatabase } from "../../webclient/server/client-state/index.js";
import { seedServerAssets, type NDXDatabase } from "./index.js";

test("server database initialization creates session and web client storage", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  await initSessionDatabase(database);
  await initWebClientStateDatabase(database);

  assert.equal(queries[0].text, SESSION_TABLE_SQL);
});

test("server asset seeding copies registered system skills from base tool owners", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-init-assets-"));
  await fs.mkdir(path.join(userHome, ".ndx", "system", "skills", "cot_solve"), { recursive: true });
  await fs.writeFile(path.join(userHome, ".ndx", "system", "skills", "cot_solve", "SKILL.md"), "stale prompt\n", "utf8");

  await seedServerAssets(userHome);

  const cotSkill = await fs.readFile(path.join(userHome, ".ndx", "system", "skills", "cot_solve", "SKILL.md"), "utf8");
  const askUserSkill = await fs.readFile(path.join(userHome, ".ndx", "system", "skills", "ask_user_question", "SKILL.md"), "utf8");
  const sessionHistorySkill = await fs.readFile(path.join(userHome, ".ndx", "system", "skills", "session_history", "SKILL.md"), "utf8");

  assert.match(cotSkill, /name: cot-solve/);
  assert.doesNotMatch(cotSkill, /stale prompt/);
  assert.match(askUserSkill, /name: ask-user-question/);
  assert.match(sessionHistorySkill, /name: session-history/);
  await assert.rejects(fs.access(path.join(userHome, ".ndx", "system", "skills", "prompt_rewrite", "SKILL.md")));
});
