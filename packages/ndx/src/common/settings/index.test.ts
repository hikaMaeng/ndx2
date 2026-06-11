import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ndxSettingsPath, readNDXWebSearchSettings } from "./index.js";

test("readNDXWebSearchSettings merges user and project websearch settings from the shared settings reader", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-settings-user-"));
  const projectHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-settings-project-"));

  try {
    await fs.mkdir(path.dirname(ndxSettingsPath(userHome)), { recursive: true });
    await fs.mkdir(path.dirname(ndxSettingsPath(projectHome)), { recursive: true });
    await fs.writeFile(ndxSettingsPath(userHome), JSON.stringify({
      websearch: {
        provider: "tavily",
        apiKey: "user-key",
        providers: { tavily: { apiKey: "nested-user-key" } }
      }
    }), "utf8");
    await fs.writeFile(ndxSettingsPath(projectHome), JSON.stringify({
      websearch: {
        apiKey: "project-key",
        baseUrl: "https://search.example/api"
      }
    }), "utf8");

    assert.deepEqual(await readNDXWebSearchSettings(userHome, projectHome), {
      provider: "tavily",
      apiKey: "project-key",
      providers: { tavily: { apiKey: "nested-user-key" } },
      baseUrl: "https://search.example/api"
    });
  } finally {
    await fs.rm(userHome, { recursive: true, force: true });
    await fs.rm(projectHome, { recursive: true, force: true });
  }
});
