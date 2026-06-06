import type { NDXWebModelRow, NDXWebProviderRow } from "./types.js";
import { promises as fs } from "node:fs";
import path from "node:path";

type NDXSettingsDocument = {
  version?: unknown;
  model?: unknown;
  providers?: Record<string, NDXSettingsProvider>;
  models?: Record<string, NDXSettingsModel>;
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

function settingsModelRow(key: string, model: NDXSettingsModel): NDXWebModelRow | undefined {
  const provider = typeof model.provider === "string" ? model.provider.trim() : "";
  const name = typeof model.name === "string" ? model.name.trim() : key.trim();
  if (!provider || !name) return undefined;
  const contextsize = typeof model.maxContext === "number" ? model.maxContext : typeof model.contextsize === "number" ? model.contextsize : typeof model.contextSize === "number" ? model.contextSize : 100_000;
  const modalities = Array.isArray(model.modalities)
    ? model.modalities.filter((item): item is "text" | "image" | "file" => item === "text" || item === "image" || item === "file")
    : ["text"] satisfies Array<"text" | "image" | "file">;
  return {
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
  return value === "low" || value === "medium" || value === "high" ? { reasoningEffort: value } : {};
}

function webReasoningEffortField(value: unknown): Pick<NDXWebModelRow, "reasoningEffort"> {
  return value === "low" || value === "medium" || value === "high" ? { reasoningEffort: value } : {};
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
  if (value === "low" || value === "medium" || value === "high") {
    target.reasoningEffort = value;
    return;
  }
  if (value === null) {
    delete target.reasoningEffort;
  }
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
