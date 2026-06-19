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
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    strictPrefixCache: false,
    tools: {}
  });
});

test("runtime settings read max model iterations from settings json", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-json-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ runtime: { maxModelIterations: 750 } }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: 750,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    strictPrefixCache: false,
    tools: {}
  });
});

test("runtime settings ignore invalid max model iterations", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-invalid-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ runtime: { maxModelIterations: 0 } }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    strictPrefixCache: false,
    tools: {}
  });
});

test("runtime settings read loop detection interval and allow non-positive disable value", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-loop-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ runtime: { maxModelIterations: 750, loopDetectionInterval: 0 } }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: 750,
    loopDetectionInterval: 0,
    strictPrefixCache: false,
    tools: {}
  });
});

test("runtime settings read strict prefix cache mode", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-strict-prefix-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ runtime: { strictPrefixCache: true } }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    strictPrefixCache: true,
    tools: {}
  });
});

test("runtime settings read prompt rewrite model from tool settings", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-prompt-rewrite-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ tools: { prompt_rewrite: { model: "qwen3.6-35b-mp" } } }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    strictPrefixCache: false,
    tools: {
      prompt_rewrite: {
        model: "qwen3.6-35b-mp"
      }
    }
  });
});

test("runtime settings read stream guard max reasoning length from hook settings", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-stream-guard-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ hooks: { StreamGuard: { MAX_REASONING_LENGTH: 12345 } } }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    strictPrefixCache: false,
    tools: {},
    hooks: {
      StreamGuard: {
        MAX_REASONING_LENGTH: 12345
      }
    }
  });
});

test("runtime settings read stream guard analysis model from hook settings", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-stream-guard-analysis-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ hooks: { StreamGuard: { analysisModel: "loop-judge" } } }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    strictPrefixCache: false,
    tools: {},
    hooks: {
      StreamGuard: {
        MAX_REASONING_LENGTH: 240000,
        analysisModel: "loop-judge"
      }
    }
  });
});

test("runtime settings read legacy stream guard model alias as analysis model", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-stream-guard-model-alias-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ hooks: { StreamGuard: { model: "legacy-loop-judge" } } }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    strictPrefixCache: false,
    tools: {},
    hooks: {
      StreamGuard: {
        MAX_REASONING_LENGTH: 240000,
        analysisModel: "legacy-loop-judge"
      }
    }
  });
});

test("runtime settings ignore invalid stream guard max reasoning length", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-stream-guard-invalid-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({ hooks: { StreamGuard: { MAX_REASONING_LENGTH: 0 } } }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    strictPrefixCache: false,
    tools: {}
  });
});

test("runtime settings read embedding provider settings", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-embeddings-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({
    embeddings: {
      provider: "local",
      model: "text-embedding-3-small",
      url: "http://127.0.0.1:11434/v1"
    }
  }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    strictPrefixCache: false,
    embeddings: {
      provider: "local",
      model: "text-embedding-3-small",
      url: "http://127.0.0.1:11434/v1"
    },
    tools: {}
  });
});

test("runtime settings resolve embedding provider url from provider settings", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-runtime-settings-embedding-provider-url-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({
    providers: {
      local: {
        type: "openai",
        key: "",
        url: "http://192.168.65.254:12345/v1"
      }
    },
    embeddings: {
      provider: "local",
      model: "qwen3-embedding-8b:mp"
    }
  }), "utf8");

  assert.deepEqual(await readAgentRuntimeSettings(userHome), {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    strictPrefixCache: false,
    embeddings: {
      provider: "local",
      model: "qwen3-embedding-8b:mp",
      url: "http://192.168.65.254:12345/v1"
    },
    tools: {}
  });
});
