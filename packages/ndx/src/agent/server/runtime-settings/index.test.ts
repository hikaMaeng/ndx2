import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_NDX_LOOP_DETECTION_INTERVAL, DEFAULT_NDX_MAX_MODEL_ITERATIONS, readAgentRuntimeSettings } from "./index.js";

test("runtime settings default max model iterations to 500", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-default-"));

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL
  });
});

test("runtime settings read max model iterations from settings json", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-json-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ runtime: { maxModelIterations: 750 } }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: 750,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL
  });
});

test("runtime settings ignore invalid max model iterations", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-invalid-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ runtime: { maxModelIterations: 0 } }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL
  });
});

test("runtime settings read loop detection interval and allow non-positive disable value", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-loop-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ runtime: { maxModelIterations: 750, loopDetectionInterval: 0 } }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: 750,
    loopDetectionInterval: 0
  });
});
