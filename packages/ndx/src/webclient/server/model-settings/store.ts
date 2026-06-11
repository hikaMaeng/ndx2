import type { NDXWebEmbeddingSettingsRow, NDXWebModelRow, NDXWebProviderRow, NDXWebSettingsDocumentInput, NDXWebSettingsDocumentRow } from "./types.js";
import { promises as fs } from "node:fs";
import path from "node:path";

type NDXSettingsDocument = {
  version?: unknown;
  model?: unknown;
  embeddings?: NDXSettingsEmbeddingSettings;
  providers?: Record<string, NDXSettingsProvider>;
  models?: Record<string, NDXSettingsModel>;
  runtime?: Record<string, unknown>;
  tools?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  websearch?: Record<string, unknown>;
  [key: string]: unknown;
};

type NDXSettingsProvider = {
  type?: unknown;
  key?: unknown;
  token?: unknown;
  apiKey?: unknown;
  url?: unknown;
  baseUrl?: unknown;
  [key: string]: unknown;
};

type NDXSettingsModel = {
  name?: unknown;
  provider?: unknown;
  modalities?: unknown;
  maxContext?: unknown;
  contextsize?: unknown;
  contextSize?: unknown;
  temperature?: unknown;
  topP?: unknown;
  topK?: unknown;
  minP?: unknown;
  MinP?: unknown;
  reasoningEffort?: unknown;
  [key: string]: unknown;
};

type NDXSettingsEmbeddingSettings = {
  provider?: unknown;
  model?: unknown;
  url?: unknown;
  token?: unknown;
  key?: unknown;
  apiKey?: unknown;
  [key: string]: unknown;
};

export async function listSettingsWebProvider(userHome: string): Promise<NDXWebProviderRow[]> {
  const settings = await readSettings(userHome);
  return Object.entries(settings.providers ?? {})
    .map(([title, provider]) => settingsProviderRow(title, provider))
    .filter((provider): provider is NDXWebProviderRow => Boolean(provider))
    .sort((left, right) => left.title.localeCompare(right.title));
}

export async function getSettingsWebProvider(userHome: string, title: string): Promise<NDXWebProviderRow | undefined> {
  const settings = await readSettings(userHome);
  const provider = settings.providers?.[title.trim()];
  return provider ? settingsProviderRow(title.trim(), provider) : undefined;
}

export async function createSettingsWebProvider(userHome: string, input: NDXWebProviderRow): Promise<NDXWebProviderRow> {
  const settings = await readSettings(userHome);
  const title = input.title.trim();
  if (!title) throw new Error("provider title is required.");
  settings.providers = settings.providers ?? {};
  const existing = settings.providers[title] ?? {};
  settings.providers[title] = {
    ...existing,
    type: "openai",
    url: input.url.trim(),
    key: input.token ?? ""
  };
  await writeSettings(userHome, settings);
  const row = settingsProviderRow(title, settings.providers[title]);
  if (!row) throw new Error("settings provider upsert returned no row.");
  return row;
}

export async function updateSettingsWebProvider(userHome: string, title: string, input: Partial<NDXWebProviderRow>): Promise<NDXWebProviderRow> {
  const settings = await readSettings(userHome);
  const key = title.trim();
  const current = settings.providers?.[key];
  if (!current) throw new Error(`settings provider not found: ${title}`);
  settings.providers = settings.providers ?? {};
  settings.providers[key] = {
    ...current,
    ...(input.type ? { type: input.type } : {}),
    ...(typeof input.url === "string" ? { url: input.url.trim() } : {}),
    ...(typeof input.token === "string" ? { key: input.token } : {})
  };
  await writeSettings(userHome, settings);
  const row = settingsProviderRow(key, settings.providers[key]);
  if (!row) throw new Error(`settings provider not found: ${title}`);
  return row;
}

export async function deleteSettingsWebProvider(userHome: string, title: string): Promise<void> {
  const settings = await readSettings(userHome);
  const key = title.trim();
  if (settings.providers) {
    delete settings.providers[key];
  }
  if (settings.models) {
    for (const [modelKey, model] of Object.entries(settings.models)) {
      if (model && typeof model === "object" && model.provider === key) {
        delete settings.models[modelKey];
      }
    }
  }
  if (settings.model && typeof settings.model === "string" && settings.models && !settings.models[settings.model]) {
    settings.model = Object.keys(settings.models)[0] ?? "";
  }
  if (settings.embeddings && typeof settings.embeddings === "object" && settings.embeddings.provider === key) {
    delete settings.embeddings;
  }
  await writeSettings(userHome, settings);
}

export async function listSettingsWebModel(userHome: string, provider: string): Promise<NDXWebModelRow[]> {
  const settings = await readSettings(userHome);
  const providerName = provider.trim();
  return Object.entries(settings.models ?? {})
    .map(([key, model]) => settingsModelRow(key, model))
    .filter((model): model is NDXWebModelRow => model !== undefined && model.provider === providerName)
    .sort((left, right) => left.model.localeCompare(right.model));
}

export async function listSettingsWebEmbeddingModel(userHome: string, provider: string): Promise<NDXWebModelRow[]> {
  return (await listSettingsWebModel(userHome, provider)).filter((model) => isEmbeddingModelName(model.model));
}

export async function createSettingsWebModel(userHome: string, input: NDXWebModelRow): Promise<NDXWebModelRow> {
  const settings = await readSettings(userHome);
  settings.providers = settings.providers ?? {};
  if (!settings.providers[input.provider.trim()]) throw new Error(`settings provider not found: ${input.provider}`);
  settings.models = settings.models ?? {};
  const key = uniqueSettingsModelKey(settings, input.model.trim());
  settings.models[key] = {
    name: input.model.trim(),
    provider: input.provider.trim(),
    maxContext: input.contextsize,
    modalities: normalizeModalities(input.modalities),
    ...settingsReasoningEffortField(input.reasoningEffort),
    ...settingsInferenceFields(input)
  };
  if (!settings.model) settings.model = key;
  await writeSettings(userHome, settings);
  const row = settingsModelRow(key, settings.models[key]);
  if (!row) throw new Error("settings model upsert returned no row.");
  return row;
}

export async function createSettingsWebEmbeddingModel(userHome: string, input: Pick<NDXWebModelRow, "provider" | "model">): Promise<NDXWebModelRow> {
  if (!isEmbeddingModelName(input.model)) throw new Error("embedding model name must include embedding.");
  const settings = await readSettings(userHome);
  settings.providers = settings.providers ?? {};
  if (!settings.providers[input.provider.trim()]) throw new Error(`settings provider not found: ${input.provider}`);
  settings.models = settings.models ?? {};
  const key = uniqueSettingsModelKey(settings, input.model.trim());
  settings.models[key] = {
    name: input.model.trim(),
    provider: input.provider.trim(),
    maxContext: 100_000,
    modalities: ["text"]
  };
  await writeSettings(userHome, settings);
  const row = settingsModelRow(key, settings.models[key]);
  if (!row) throw new Error("settings embedding model upsert returned no row.");
  return row;
}

export async function updateSettingsWebModel(userHome: string, provider: string, model: string, input: {
  contextsize: number;
  modalities?: Array<"text" | "image" | "file">;
  reasoningEffort?: "low" | "medium" | "high" | null;
  temperature?: number | null;
  topP?: number | null;
  topK?: number | null;
  minP?: number | null;
}): Promise<NDXWebModelRow> {
  const settings = await readSettings(userHome);
  const found = findSettingsModel(settings, provider, model);
  if (!found) throw new Error(`settings model not found: ${provider}/${model}`);
  settings.models = settings.models ?? {};
  settings.models[found.key] = {
    ...found.model,
    maxContext: input.contextsize,
    modalities: input.modalities ? normalizeModalities(input.modalities) : normalizeModalities(Array.isArray(found.model.modalities) ? found.model.modalities as Array<"text" | "image" | "file"> : undefined)
  };
  applyOptionalReasoningEffort(settings.models[found.key], input.reasoningEffort);
  applyOptionalNumber(settings.models[found.key], "temperature", input.temperature);
  applyOptionalNumber(settings.models[found.key], "topP", input.topP);
  applyOptionalNumber(settings.models[found.key], "topK", input.topK);
  applyOptionalNumber(settings.models[found.key], "MinP", input.minP);
  delete settings.models[found.key].minP;
  await writeSettings(userHome, settings);
  const row = settingsModelRow(found.key, settings.models[found.key]);
  if (!row) throw new Error(`settings model not found: ${provider}/${model}`);
  return row;
}

export async function deleteSettingsWebModel(userHome: string, provider: string, model: string): Promise<void> {
  const settings = await readSettings(userHome);
  const found = findSettingsModel(settings, provider, model);
  if (found && settings.models) {
    delete settings.models[found.key];
    if (settings.embeddings && typeof settings.embeddings === "object" && settings.embeddings.provider === provider.trim() && settings.embeddings.model === model.trim()) {
      delete settings.embeddings;
    }
    if (settings.model === found.key) {
      settings.model = Object.keys(settings.models)[0] ?? "";
    }
  }
  await writeSettings(userHome, settings);
}

export async function syncSettingsWebProviderModels(userHome: string, provider: NDXWebProviderRow): Promise<NDXWebModelRow[]> {
  const settings = await readSettings(userHome);
  const body = await fetchProviderModels(provider);
  const upstreamModels = Array.isArray(body.data)
    ? body.data.map((item) => (typeof item.id === "string" ? item.id.trim() : "")).filter(Boolean)
    : [];
  settings.models = settings.models ?? {};
  const existing = new Set(
    Object.values(settings.models)
      .filter((model) => model && typeof model === "object" && model.provider === provider.title)
      .map((model) => String(model.name ?? "").trim())
      .filter(Boolean)
  );
  for (const model of upstreamModels) {
    if (existing.has(model)) continue;
    const key = uniqueSettingsModelKey(settings, model);
    settings.models[key] = { name: model, provider: provider.title, maxContext: 100_000, modalities: ["text"] };
    existing.add(model);
  }
  await writeSettings(userHome, settings);
  return listSettingsWebModel(userHome, provider.title);
}

export async function syncSettingsWebProviderEmbeddingModels(userHome: string, provider: NDXWebProviderRow): Promise<NDXWebModelRow[]> {
  const settings = await readSettings(userHome);
  const body = await fetchProviderModels(provider);
  const upstreamModels = Array.isArray(body.data)
    ? body.data.map((item) => (typeof item.id === "string" ? item.id.trim() : "")).filter((model) => model && isEmbeddingModelName(model))
    : [];
  settings.models = settings.models ?? {};
  const existing = new Set(
    Object.values(settings.models)
      .filter((model) => model && typeof model === "object" && model.provider === provider.title)
      .map((model) => String(model.name ?? "").trim())
      .filter(Boolean)
  );
  for (const model of upstreamModels) {
    if (existing.has(model)) continue;
    const key = uniqueSettingsModelKey(settings, model);
    settings.models[key] = { name: model, provider: provider.title, maxContext: 100_000, modalities: ["text"] };
    existing.add(model);
  }
  await writeSettings(userHome, settings);
  return listSettingsWebEmbeddingModel(userHome, provider.title);
}

export async function getSettingsWebEmbeddingSettings(userHome: string): Promise<NDXWebEmbeddingSettingsRow | undefined> {
  const settings = await readSettings(userHome);
  return settingsEmbeddingRow(settings.embeddings);
}

export async function updateSettingsWebEmbeddingSettings(userHome: string, input: NDXWebEmbeddingSettingsRow): Promise<NDXWebEmbeddingSettingsRow> {
  const settings = await readSettings(userHome);
  const provider = input.provider.trim();
  const model = input.model.trim();
  if (!provider || !model) throw new Error("embedding provider and model are required.");
  if (!settings.providers?.[provider]) throw new Error(`settings provider not found: ${provider}`);
  if (!isEmbeddingModelName(model)) throw new Error("embedding model name must include embedding.");
  settings.embeddings = {
    ...(settings.embeddings && typeof settings.embeddings === "object" ? settings.embeddings : {}),
    provider,
    model
  };
  delete settings.embeddings.url;
  delete settings.embeddings.token;
  delete settings.embeddings.key;
  delete settings.embeddings.apiKey;
  await writeSettings(userHome, settings);
  const row = settingsEmbeddingRow(settings.embeddings);
  if (!row) throw new Error("settings embedding update returned no row.");
  return row;
}

export async function getSettingsWebDocument(userHome: string): Promise<NDXWebSettingsDocumentRow> {
  const settings = await readSettings(userHome);
  return settingsDocumentRow(settings);
}

export async function updateSettingsWebDocument(userHome: string, input: NDXWebSettingsDocumentInput): Promise<NDXWebSettingsDocumentRow> {
  const settings = await readSettings(userHome);
  if (typeof input.version === "string") {
    const version = input.version.trim();
    if (version) settings.version = version;
  }
  if (typeof input.defaultModelKey === "string") {
    const modelKey = input.defaultModelKey.trim();
    if (modelKey && !settings.models?.[modelKey]) throw new Error(`settings model key not found: ${modelKey}`);
    settings.model = modelKey;
  }
  if (input.runtime) {
    settings.runtime = settings.runtime && typeof settings.runtime === "object" && !Array.isArray(settings.runtime) ? settings.runtime : {};
    if (typeof input.runtime.maxModelIterations === "number" && Number.isInteger(input.runtime.maxModelIterations) && input.runtime.maxModelIterations > 0) {
      settings.runtime.maxModelIterations = input.runtime.maxModelIterations;
    }
    if (typeof input.runtime.loopDetectionInterval === "number" && Number.isInteger(input.runtime.loopDetectionInterval)) {
      settings.runtime.loopDetectionInterval = input.runtime.loopDetectionInterval;
    }
  }
  if (input.tools?.prompt_rewrite) {
    settings.tools = settings.tools && typeof settings.tools === "object" && !Array.isArray(settings.tools) ? settings.tools : {};
    const promptRewrite = settings.tools.prompt_rewrite && typeof settings.tools.prompt_rewrite === "object" && !Array.isArray(settings.tools.prompt_rewrite)
      ? settings.tools.prompt_rewrite as Record<string, unknown>
      : {};
    const model = input.tools.prompt_rewrite.model?.trim() ?? "";
    if (model) promptRewrite.model = model;
    else delete promptRewrite.model;
    settings.tools.prompt_rewrite = promptRewrite;
  }
  if (input.hooks?.StreamGuard) {
    settings.hooks = settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks) ? settings.hooks : {};
    const streamGuard = settings.hooks.StreamGuard && typeof settings.hooks.StreamGuard === "object" && !Array.isArray(settings.hooks.StreamGuard)
      ? settings.hooks.StreamGuard as Record<string, unknown>
      : {};
    const maxReasoningLength = input.hooks.StreamGuard.MAX_REASONING_LENGTH;
    if (typeof maxReasoningLength === "number" && Number.isInteger(maxReasoningLength) && maxReasoningLength > 0) streamGuard.MAX_REASONING_LENGTH = maxReasoningLength;
    else if (maxReasoningLength !== undefined) delete streamGuard.MAX_REASONING_LENGTH;
    settings.hooks.StreamGuard = streamGuard;
  }
  if (input.websearch) {
    settings.websearch = settings.websearch && typeof settings.websearch === "object" && !Array.isArray(settings.websearch) ? settings.websearch : {};
    applyOptionalString(settings.websearch, "provider", input.websearch.provider);
    applyOptionalString(settings.websearch, "apiKey", input.websearch.apiKey);
    applyOptionalString(settings.websearch, "baseUrl", input.websearch.baseUrl);
    applyOptionalString(settings.websearch, "method", input.websearch.method);
    applyOptionalString(settings.websearch, "queryParam", input.websearch.queryParam);
    if (typeof input.websearch.providersJson === "string") {
      const providers = input.websearch.providersJson.trim() ? JSON.parse(input.websearch.providersJson) as unknown : undefined;
      if (providers && (typeof providers !== "object" || Array.isArray(providers))) throw new Error("websearch.providers must be a JSON object.");
      if (providers) settings.websearch.providers = providers;
      else delete settings.websearch.providers;
    }
  }
  if (typeof input.otherJson === "string") {
    const parsed = input.otherJson.trim() ? JSON.parse(input.otherJson) as unknown : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("other settings must be a JSON object.");
    for (const key of Object.keys(settings)) {
      if (!SETTINGS_KNOWN_TOP_LEVEL_KEYS.has(key)) delete settings[key];
    }
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!SETTINGS_KNOWN_TOP_LEVEL_KEYS.has(key)) settings[key] = value;
    }
  }
  await writeSettings(userHome, settings);
  return settingsDocumentRow(settings);
}

function normalizeModalities(value: Array<"text" | "image" | "file"> | undefined): Array<"text" | "image" | "file"> {
  const allowed = new Set(["text", "image", "file"]);
  const next = [...new Set([...(value ?? []), "text"])].filter((item) => allowed.has(item));
  return next as Array<"text" | "image" | "file">;
}

async function readSettings(userHome: string): Promise<NDXSettingsDocument> {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath(userHome), "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? parsed as NDXSettingsDocument : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: "0.1.0", providers: {}, models: {} };
    }
    throw error;
  }
}

async function writeSettings(userHome: string, settings: NDXSettingsDocument): Promise<void> {
  const file = settingsPath(userHome);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function settingsPath(userHome: string): string {
  return path.join(userHome, ".ndx", "settings.json");
}

function settingsProviderRow(title: string, provider: NDXSettingsProvider): NDXWebProviderRow | undefined {
  const url = typeof provider.url === "string" ? provider.url.trim() : typeof provider.baseUrl === "string" ? provider.baseUrl.trim() : "";
  if (!title.trim() || !url) return undefined;
  return {
    title: title.trim(),
    type: "openai",
    url,
    token: typeof provider.token === "string" ? provider.token : typeof provider.key === "string" ? provider.key : typeof provider.apiKey === "string" ? provider.apiKey : ""
  };
}

function settingsEmbeddingRow(value: unknown): NDXWebEmbeddingSettingsRow | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as { provider?: unknown; model?: unknown };
  const provider = typeof record.provider === "string" ? record.provider.trim() : "";
  const model = typeof record.model === "string" ? record.model.trim() : "";
  return provider && model ? { provider, model } : undefined;
}

const SETTINGS_KNOWN_TOP_LEVEL_KEYS = new Set(["version", "model", "providers", "models", "embeddings", "runtime", "tools", "hooks", "websearch"]);

function settingsDocumentRow(settings: NDXSettingsDocument): NDXWebSettingsDocumentRow {
  const runtime = settings.runtime && typeof settings.runtime === "object" && !Array.isArray(settings.runtime) ? settings.runtime : {};
  const tools = settings.tools && typeof settings.tools === "object" && !Array.isArray(settings.tools) ? settings.tools : {};
  const hooks = settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks) ? settings.hooks : {};
  const websearch = settings.websearch && typeof settings.websearch === "object" && !Array.isArray(settings.websearch) ? settings.websearch : {};
  const promptRewrite = tools.prompt_rewrite && typeof tools.prompt_rewrite === "object" && !Array.isArray(tools.prompt_rewrite) ? tools.prompt_rewrite as Record<string, unknown> : {};
  const streamGuard = hooks.StreamGuard && typeof hooks.StreamGuard === "object" && !Array.isArray(hooks.StreamGuard) ? hooks.StreamGuard as Record<string, unknown> : {};
  const other = Object.fromEntries(Object.entries(settings).filter(([key]) => !SETTINGS_KNOWN_TOP_LEVEL_KEYS.has(key)));
  return {
    version: typeof settings.version === "string" ? settings.version : "",
    defaultModelKey: typeof settings.model === "string" ? settings.model : "",
    runtime: {
      maxModelIterations: typeof runtime.maxModelIterations === "number" && Number.isInteger(runtime.maxModelIterations) && runtime.maxModelIterations > 0 ? runtime.maxModelIterations : 500,
      loopDetectionInterval: typeof runtime.loopDetectionInterval === "number" && Number.isInteger(runtime.loopDetectionInterval) ? runtime.loopDetectionInterval : 50
    },
    tools: {
      prompt_rewrite: {
        model: typeof promptRewrite.model === "string" ? promptRewrite.model : ""
      }
    },
    hooks: {
      StreamGuard: {
        MAX_REASONING_LENGTH: typeof streamGuard.MAX_REASONING_LENGTH === "number" && Number.isInteger(streamGuard.MAX_REASONING_LENGTH) && streamGuard.MAX_REASONING_LENGTH > 0 ? streamGuard.MAX_REASONING_LENGTH : 240_000
      }
    },
    websearch: {
      provider: typeof websearch.provider === "string" ? websearch.provider : "duckduckgo",
      apiKey: typeof websearch.apiKey === "string" ? websearch.apiKey : "",
      baseUrl: typeof websearch.baseUrl === "string" ? websearch.baseUrl : "",
      method: typeof websearch.method === "string" ? websearch.method : "",
      queryParam: typeof websearch.queryParam === "string" ? websearch.queryParam : "",
      providersJson: JSON.stringify(websearch.providers && typeof websearch.providers === "object" && !Array.isArray(websearch.providers) ? websearch.providers : {}, null, 2)
    },
    otherJson: JSON.stringify(other, null, 2),
    topLevelKeys: Object.keys(settings).sort()
  };
}

function applyOptionalString(target: Record<string, unknown>, key: string, value: string | undefined): void {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) target[key] = trimmed;
  else delete target[key];
}

function settingsModelRow(key: string, model: NDXSettingsModel): NDXWebModelRow | undefined {
  const provider = typeof model.provider === "string" ? model.provider.trim() : "";
  const name = typeof model.name === "string" ? model.name.trim() : key.trim();
  if (!provider || !name) return undefined;
  const contextsize = typeof model.maxContext === "number" ? model.maxContext : typeof model.contextsize === "number" ? model.contextsize : typeof model.contextSize === "number" ? model.contextSize : 100_000;
  const modalities = Array.isArray(model.modalities)
    ? model.modalities.filter((item): item is "text" | "image" | "file" => item === "text" || item === "image" || item === "file")
    : ["text"] satisfies Array<"text" | "image" | "file">;
  return {
    key: key.trim(),
    provider,
    model: name,
    contextsize,
    modalities: normalizeModalities(modalities),
    ...webReasoningEffortField(model.reasoningEffort),
    ...optionalNumberField("temperature", model.temperature),
    ...optionalNumberField("topP", model.topP),
    ...optionalNumberField("topK", model.topK),
    ...optionalNumberField("minP", model.minP ?? model.MinP)
  };
}

function settingsInferenceFields(input: NDXWebModelRow): Partial<NDXSettingsModel> {
  return {
    ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
    ...(typeof input.topP === "number" ? { topP: input.topP } : {}),
    ...(typeof input.topK === "number" ? { topK: input.topK } : {}),
    ...(typeof input.minP === "number" ? { MinP: input.minP } : {})
  };
}

function settingsReasoningEffortField(value: unknown): Pick<NDXSettingsModel, "reasoningEffort"> {
  const effort = normalizeStoredReasoningEffort(value);
  return effort ? { reasoningEffort: effort } : {};
}

function webReasoningEffortField(value: unknown): Pick<NDXWebModelRow, "reasoningEffort"> {
  const effort = normalizeStoredReasoningEffort(value);
  return effort ? { reasoningEffort: effort } : {};
}

function optionalNumberField<Key extends string>(key: Key, value: unknown): Partial<Record<Key, number>> {
  return typeof value === "number" && Number.isFinite(value) ? { [key]: value } as Partial<Record<Key, number>> : {};
}

function applyOptionalNumber(target: NDXSettingsModel, key: "temperature" | "topP" | "topK" | "MinP", value: number | null | undefined): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = value;
    return;
  }
  if (value === null) {
    delete target[key];
  }
}

function applyOptionalReasoningEffort(target: NDXSettingsModel, value: "low" | "medium" | "high" | null | undefined): void {
  const effort = normalizeStoredReasoningEffort(value);
  if (effort) {
    target.reasoningEffort = effort;
    return;
  }
  if (value === null) {
    delete target.reasoningEffort;
  }
}

function normalizeStoredReasoningEffort(value: unknown): "low" | "medium" | "high" | undefined {
  if (value === "nothink") return "low";
  if (value === "normal") return "medium";
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function findSettingsModel(settings: NDXSettingsDocument, provider: string, model: string): { key: string; model: NDXSettingsModel } | undefined {
  for (const [key, value] of Object.entries(settings.models ?? {})) {
    const row = settingsModelRow(key, value);
    if (row?.provider === provider.trim() && row.model === model.trim()) {
      return { key, model: value };
    }
  }
  return undefined;
}

function uniqueSettingsModelKey(settings: NDXSettingsDocument, model: string): string {
  const base = model.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "model";
  if (!settings.models?.[base]) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`;
    if (!settings.models[candidate]) return candidate;
  }
}

function isEmbeddingModelName(model: string): boolean {
  return model.toLowerCase().includes("embedding");
}

async function fetchProviderModels(provider: NDXWebProviderRow): Promise<{ data?: Array<{ id?: string }> }> {
  const endpoints = providerModelEndpointCandidates(provider.url);
  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      const timeoutSignal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(5_000) : undefined;
      const response = await fetch(endpoint, {
        headers: provider.token ? { Authorization: `Bearer ${provider.token}` } : {},
        ...(timeoutSignal ? { signal: timeoutSignal } : {})
      });
      if (response.ok) {
        return (await response.json()) as { data?: Array<{ id?: string }> };
      }
      lastError = new Error(`provider model sync failed: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("provider model sync failed.");
}

export function providerModelEndpointCandidates(providerUrlText: string): string[] {
  const providerUrl = new URL(providerUrlText.trim());
  const normalizedPath = providerUrl.pathname.replace(/\/$/, "");
  const endpoints = [new URL(`${normalizedPath}/models`, providerUrl)];
  if (!normalizedPath.endsWith("/v1")) {
    endpoints.push(new URL(`${normalizedPath}/v1/models`, providerUrl));
  }
  return endpoints.map((endpoint) => endpoint.toString());
}
