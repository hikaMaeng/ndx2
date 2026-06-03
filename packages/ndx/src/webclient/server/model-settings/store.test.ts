import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSettingsWebModel, createSettingsWebProvider, deleteSettingsWebModel, listSettingsWebModel, listSettingsWebProvider, providerModelEndpointCandidates, updateSettingsWebModel, updateSettingsWebProvider } from "./store.js";

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
      qwencoder: { name: "qwen3-coder-next:tr", provider: "local", modalities: ["text", "image"], maxContext: 262000, temperature: 1, topP: 0.95, topK: 40, MinP: 0 }
    },
    websearch: { provider: "tavily" }
  }), "utf8");

  try {
    assert.deepEqual(await listSettingsWebProvider(userHome), [
      { title: "local", type: "openai", url: "http://192.168.65.254:12345/v1", token: "" }
    ]);
    assert.deepEqual(await listSettingsWebModel(userHome, "local"), [
      { provider: "local", model: "qwen3-coder-next:tr", contextsize: 262000, modalities: ["text", "image"], temperature: 1, topP: 0.95, topK: 40, minP: 0 }
    ]);

    await updateSettingsWebProvider(userHome, "local", { url: "http://example.test/v1", token: "secret" });
    await createSettingsWebProvider(userHome, { title: "remote", type: "openai", url: "https://api.example.test/v1", token: "r" });
    await createSettingsWebModel(userHome, { provider: "remote", model: "gpt-test", contextsize: 128000, modalities: ["text", "file"], temperature: 0.7, topP: 0.9, topK: 50, minP: 0.05 });
    await updateSettingsWebModel(userHome, "remote", "gpt-test", { contextsize: 64000, temperature: null, topP: 0.8, topK: null, minP: 0 });
    await deleteSettingsWebModel(userHome, "local", "qwen3-coder-next:tr");

    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8")) as {
      providers: Record<string, { url?: string; key?: string }>;
      models: Record<string, { name?: string; provider?: string; maxContext?: number; modalities?: string[]; temperature?: number; topP?: number; topK?: number; MinP?: number }>;
      websearch?: unknown;
    };
    assert.equal(settings.providers.local.url, "http://example.test/v1");
    assert.equal(settings.providers.local.key, "secret");
    assert.equal(settings.providers.remote.url, "https://api.example.test/v1");
    assert.equal(settings.models["gpt-test"].provider, "remote");
    assert.equal(settings.models["gpt-test"].maxContext, 64000);
    assert.deepEqual(settings.models["gpt-test"].modalities, ["text", "file"]);
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
