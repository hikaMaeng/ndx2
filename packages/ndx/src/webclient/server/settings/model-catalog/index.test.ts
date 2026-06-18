import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSettingsWebEmbeddingModel, createSettingsWebModel, createSettingsWebProvider, deleteSettingsWebModel, getSettingsWebDocument, getSettingsWebEmbeddingSettings, listSettingsWebEmbeddingModel, listSettingsWebModel, listSettingsWebProvider, providerModelEndpointCandidates, syncSettingsWebProviderEmbeddingModels, syncSettingsWebProviderModels, updateSettingsWebDocument, updateSettingsWebEmbeddingSettings, updateSettingsWebModel, updateSettingsWebProvider } from "./index.js";

test("providerModelEndpointCandidates keeps the configured host unchanged", () => {
  assert.deepEqual(providerModelEndpointCandidates("http://127.0.0.1:12345/v1"), [
    "http://127.0.0.1:12345/v1/models"
  ]);
  assert.deepEqual(providerModelEndpointCandidates("https://api.example.com/openai"), [
    "https://api.example.com/openai/models",
    "https://api.example.com/openai/v1/models"
  ]);
});

test("settings-backed web providers and models edit .ndx/settings.json as source of truth", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-settings-models-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({
    version: "0.1.41",
    model: "qwencoder",
    providers: {
      local: { type: "openai", key: "", url: "http://192.168.65.254:12345/v1" }
    },
    models: {
      qwencoder: { name: "qwen3-coder-next:tr", provider: "local", modalities: ["text", "image"], maxContext: 262000, reasoningEffort: "high", temperature: 1, topP: 0.95, topK: 40, MinP: 0 }
    },
    websearch: { provider: "tavily" }
  }), "utf8");

  try {
    assert.deepEqual(await listSettingsWebProvider(userHome), [
      { title: "local", type: "openai", url: "http://192.168.65.254:12345/v1", token: "" }
    ]);
    assert.deepEqual(await listSettingsWebModel(userHome, "local"), [
      { key: "qwencoder", provider: "local", model: "qwen3-coder-next:tr", contextsize: 262000, modalities: ["text", "image"], reasoningEffort: "high", temperature: 1, topP: 0.95, topK: 40, minP: 0 }
    ]);

    await updateSettingsWebProvider(userHome, "local", { url: "http://example.test/v1", token: "secret" });
    await createSettingsWebProvider(userHome, { title: "remote", type: "openai", url: "https://api.example.test/v1", token: "r" });
    await createSettingsWebModel(userHome, { provider: "remote", model: "gpt-test", contextsize: 128000, modalities: ["text", "file"], reasoningEffort: "low", temperature: 0.7, topP: 0.9, topK: 50, minP: 0.05 });
    await updateSettingsWebModel(userHome, "remote", "gpt-test", { contextsize: 64000, reasoningEffort: "medium", temperature: null, topP: 0.8, topK: null, minP: 0 });
    await deleteSettingsWebModel(userHome, "local", "qwen3-coder-next:tr");

    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8")) as {
      providers: Record<string, { url?: string; key?: string }>;
      models: Record<string, { name?: string; provider?: string; maxContext?: number; modalities?: string[]; reasoningEffort?: string; temperature?: number; topP?: number; topK?: number; MinP?: number }>;
      websearch?: unknown;
    };
    assert.equal(settings.providers.local.url, "http://example.test/v1");
    assert.equal(settings.providers.local.key, "secret");
    assert.equal(settings.providers.remote.url, "https://api.example.test/v1");
    assert.equal(settings.models["gpt-test"].provider, "remote");
    assert.equal(settings.models["gpt-test"].maxContext, 64000);
    assert.deepEqual(settings.models["gpt-test"].modalities, ["text", "file"]);
    assert.equal(settings.models["gpt-test"].reasoningEffort, "medium");
    assert.equal(settings.models["gpt-test"].temperature, undefined);
    assert.equal(settings.models["gpt-test"].topP, 0.8);
    assert.equal(settings.models["gpt-test"].topK, undefined);
    assert.equal(settings.models["gpt-test"].MinP, 0);
    assert.equal(Object.values(settings.models).some((model) => model.name === "qwen3-coder-next:tr"), false);
    assert.deepEqual(settings.websearch, { provider: "tavily" });
  } finally {
    await fs.rm(userHome, { recursive: true, force: true });
  }
});

test("settings-backed embedding models filter names and update embeddings in settings json", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-settings-embeddings-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({
    version: "0.1.41",
    model: "chat",
    embeddings: { provider: "local", model: "old-embedding", url: "http://stale.example/v1", token: "stale" },
    providers: {
      local: { type: "openai", key: "secret", url: "http://embedding.example/v1" }
    },
    models: {
      chat: { name: "qwen3-coder", provider: "local", maxContext: 100000, modalities: ["text"] },
      oldEmbedding: { name: "old-embedding", provider: "local", maxContext: 100000, modalities: ["text"] }
    }
  }), "utf8");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    data: [
      { id: "plain-new-model" },
      { id: "text-embedding-3-small" },
      { id: "bge-m3-embedding" }
    ]
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;

  try {
    assert.deepEqual(await listSettingsWebEmbeddingModel(userHome, "local"), [
      { key: "oldEmbedding", provider: "local", model: "old-embedding", contextsize: 100000, modalities: ["text"] }
    ]);
    assert.deepEqual(await getSettingsWebEmbeddingSettings(userHome), { provider: "local", model: "old-embedding" });

    await syncSettingsWebProviderEmbeddingModels(userHome, { title: "local", type: "openai", url: "http://embedding.example/v1", token: "secret" });
    await createSettingsWebEmbeddingModel(userHome, { provider: "local", model: "custom-embedding-local" });
    await updateSettingsWebEmbeddingSettings(userHome, { provider: "local", model: "text-embedding-3-small" });

    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8")) as {
      model?: string;
      embeddings?: { provider?: string; model?: string; url?: string; token?: string };
      models: Record<string, { name?: string }>;
    };
    assert.equal(settings.model, "chat");
    assert.deepEqual(settings.embeddings, { provider: "local", model: "text-embedding-3-small" });
    assert.equal(Object.values(settings.models).some((model) => model.name === "plain-new-model"), false);
    assert.equal(Object.values(settings.models).some((model) => model.name === "text-embedding-3-small"), true);
    assert.equal(Object.values(settings.models).some((model) => model.name === "bge-m3-embedding"), true);
    assert.equal(Object.values(settings.models).some((model) => model.name === "custom-embedding-local"), true);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(userHome, { recursive: true, force: true });
  }
});

test("settings-backed provider model sync skips embed models for session model catalog", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-settings-model-sync-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({
    version: "0.1.41",
    providers: {
      local: { type: "openai", key: "secret", url: "http://models.example/v1" }
    },
    models: {}
  }), "utf8");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    data: [
      { id: "qwen3-coder-next" },
      { id: "qwen3-embed-8b" },
      { id: "text-embedding-3-small" }
    ]
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;

  try {
    await syncSettingsWebProviderModels(userHome, { title: "local", type: "openai", url: "http://models.example/v1", token: "secret" });

    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8")) as {
      models: Record<string, { name?: string }>;
    };
    assert.equal(Object.values(settings.models).some((model) => model.name === "qwen3-coder-next"), true);
    assert.equal(Object.values(settings.models).some((model) => model.name === "qwen3-embed-8b"), false);
    assert.equal(Object.values(settings.models).some((model) => model.name === "text-embedding-3-small"), false);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(userHome, { recursive: true, force: true });
  }
});

test("settings document row edits runtime tool hook websearch and other settings", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-settings-document-"));
  const settingsPath = path.join(userHome, ".ndx", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify({
    version: "0.1.41",
    model: "chat",
    models: {
      chat: { name: "chat-model", provider: "local" },
      rewrite: { name: "rewrite-model", provider: "local" }
    },
    runtime: { maxModelIterations: 500 },
    tools: { prompt_rewrite: { model: "old-model" } },
    hooks: { StreamGuard: { MAX_REASONING_LENGTH: 240000, analysisModel: "old-loop-judge" } },
    websearch: { provider: "tavily", apiKey: "old" },
    permissions: { defaultMode: "danger-full-access" }
  }), "utf8");

  try {
    const before = await getSettingsWebDocument(userHome);
    assert.equal(before.defaultModelKey, "chat");
    assert.equal(before.runtime.loopDetectionInterval, 50);
    assert.match(before.otherJson, /permissions/);

    await updateSettingsWebDocument(userHome, {
      defaultModelKey: "rewrite",
      runtime: { maxModelIterations: 750, loopDetectionInterval: 0 },
      tools: { prompt_rewrite: { model: "rewrite-model" } },
      hooks: { StreamGuard: { MAX_REASONING_LENGTH: 12345, analysisModel: "loop-judge" } },
      websearch: {
        provider: "custom",
        apiKey: "",
        baseUrl: "https://search.example/api",
        method: "POST",
        queryParam: "query",
        providersJson: JSON.stringify({ custom: { apiKey: "secret" } })
      },
      otherJson: JSON.stringify({ permissions: { defaultMode: "read-only" }, extra: true })
    });

    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8")) as {
      model?: string;
      runtime?: { maxModelIterations?: number; loopDetectionInterval?: number };
      tools?: { prompt_rewrite?: { model?: string } };
      hooks?: { StreamGuard?: { MAX_REASONING_LENGTH?: number; analysisModel?: string } };
      websearch?: { provider?: string; apiKey?: string; baseUrl?: string; method?: string; queryParam?: string; providers?: unknown };
      permissions?: unknown;
      extra?: unknown;
    };
    assert.equal(settings.model, "rewrite");
    assert.deepEqual(settings.runtime, { maxModelIterations: 750, loopDetectionInterval: 0 });
    assert.deepEqual(settings.tools, { prompt_rewrite: { model: "rewrite-model" } });
    assert.deepEqual(settings.hooks, { StreamGuard: { MAX_REASONING_LENGTH: 12345, analysisModel: "loop-judge" } });
    assert.deepEqual(settings.websearch, {
      provider: "custom",
      baseUrl: "https://search.example/api",
      method: "POST",
      queryParam: "query",
      providers: { custom: { apiKey: "secret" } }
    });
    assert.deepEqual(settings.permissions, { defaultMode: "read-only" });
    assert.equal(settings.extra, true);
  } finally {
    await fs.rm(userHome, { recursive: true, force: true });
  }
});
