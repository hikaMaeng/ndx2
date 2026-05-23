import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createNDXLogger } from "./index.js";

test("web logs keep the year/month/day path", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-log-web-"));
  const lines: string[] = [];
  const logger = createNDXLogger({
    surface: "web",
    rootDir,
    console: {
      log(line) {
        lines.push(String(line));
      },
      error(line) {
        lines.push(String(line));
      }
    },
    clock: () => new Date("2026-05-19T01:02:03.000Z")
  });

  logger.info("web.request.complete", { status: 200 });

  const file = await fs.readFile(path.join(rootDir, "web", "2026", "05", "19.log"), "utf8");
  assert.match(file, /"event":"web.request.complete"/);
  assert.equal(lines.length, 1);
});

test("session logs are split by session id and yyyymmdd file", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-log-session-"));
  const sessionid = "018f0000-0000-7000-8000-000000000000";
  const logger = createNDXLogger({
    surface: "agent",
    rootDir,
    console: {
      log() {},
      error() {}
    },
    clock: () => new Date("2026-05-19T01:02:03.000Z")
  });

  logger.info("agent.server.session.create.complete", { sessionid });

  const file = await fs.readFile(path.join(rootDir, "session", sessionid, "20260519.log"), "utf8");
  assert.match(file, /"event":"agent.server.session.create.complete"/);
  await assert.rejects(fs.stat(path.join(rootDir, "agent", "2026", "05", "19.log")));
});
