import { promises as fs } from "node:fs";
import path from "node:path";

export const DEFAULT_NDX_MAX_MODEL_ITERATIONS = 500;
export const DEFAULT_NDX_LOOP_DETECTION_INTERVAL = 50;
export const SETTINGS_KNOWN_TOP_LEVEL_KEYS = new Set(["version", "model", "providers", "models", "embeddings", "runtime", "tools", "hooks", "websearch"]);

export type NDXSettingsReasoningEffort = "low" | "medium" | "high";
export type NDXSettingsModality = "text" | "image" | "file";

export type NDXSettingsDocument = {
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

export type NDXSettingsProvider = {
  type?: unknown;
  key?: unknown;
  token?: unknown;
  apiKey?: unknown;
  url?: unknown;
  baseUrl?: unknown;
  [key: string]: unknown;
};

export type NDXSettingsModel = {
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

export type NDXSettingsEmbeddingSettings = {
  provider?: unknown;
  model?: unknown;
  url?: unknown;
  token?: unknown;
  key?: unknown;
  apiKey?: unknown;
  [key: string]: unknown;
};

export type NDXSettingsProviderRow = {
  title: string;
  type: "openai";
  url: string;
  token: string;
};

export type NDXSettingsModelRow = {
  key?: string;
  provider: string;
  model: string;
  contextsize: number;
  modalities: NDXSettingsModality[];
  reasoningEffort?: NDXSettingsReasoningEffort;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export type NDXSettingsEmbeddingSettingsRow = {
  provider: string;
  model: string;
};

export type NDXSettingsDocumentRow = {
  version: string;
  defaultModelKey: string;
  runtime: {
    maxModelIterations: number;
    loopDetectionInterval: number;
  };
  tools: {
    prompt_rewrite: {
      model: string;
    };
  };
  hooks: {
    StreamGuard: {
      MAX_REASONING_LENGTH: number;
      analysisModel: string;
    };
  };
  websearch: {
    provider: string;
    apiKey: string;
    baseUrl: string;
    method: string;
    queryParam: string;
    providersJson: string;
  };
  otherJson: string;
  topLevelKeys: string[];
};

export type NDXSettingsDocumentInput = {
  version?: string;
  defaultModelKey?: string;
  runtime?: {
    maxModelIterations?: number;
    loopDetectionInterval?: number;
  };
  tools?: {
    prompt_rewrite?: {
      model?: string;
    };
  };
  hooks?: {
    StreamGuard?: {
      MAX_REASONING_LENGTH?: number;
      analysisModel?: string;
    };
  };
  websearch?: {
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
    method?: string;
    queryParam?: string;
    providersJson?: string;
  };
  otherJson?: string;
};

export type NDXSettingsProviderUpstreamModel = {
  id: string;
  contextsize?: number;
};

export type NDXAgentRuntimeSettings = {
  maxModelIterations: number;
  loopDetectionInterval: number;
  embeddings?: {
    provider: string;
    model: string;
    url?: string;
    token?: string;
  };
  tools: {
    prompt_rewrite?: {
      model?: string;
    };
  };
  hooks?: {
    StreamGuard?: {
      MAX_REASONING_LENGTH: number;
      analysisModel?: string;
    };
  };
};

export type NDXSettingsResolvedModelConfig = {
  type: "openai";
  provider: string;
  model: string;
  url: string;
  token: string;
  contextsize: number;
  modalities: NDXSettingsModality[];
  reasoningEffort?: NDXSettingsReasoningEffort;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export async function readNDXSettingsDocument(userHome: string): Promise<NDXSettingsDocument> {
  return readNDXSettingsDocumentFile(ndxSettingsPath(userHome), { version: "0.1.0", providers: {}, models: {} });
}

export async function readNDXWebSearchSettings(userHome: string | undefined, projectHome: string | undefined): Promise<Record<string, unknown>> {
  const settings: Record<string, unknown> = {};
  for (const file of [
    userHome ? ndxSettingsPath(userHome) : "",
    projectHome ? ndxSettingsPath(projectHome) : ""
  ]) {
    if (!file) continue;
    const document = await readNDXSettingsDocumentFile(file, {});
    if (document.websearch && typeof document.websearch === "object" && !Array.isArray(document.websearch)) {
      Object.assign(settings, document.websearch);
    }
  }
  return settings;
}

async function readNDXSettingsDocumentFile(file: string, fallback: NDXSettingsDocument): Promise<NDXSettingsDocument> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as NDXSettingsDocument : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeNDXSettingsDocument(userHome: string, settings: NDXSettingsDocument): Promise<void> {
  const file = ndxSettingsPath(userHome);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

export function ndxSettingsPath(userHome: string): string {
  return path.join(userHome, ".ndx", "settings.json");
}

export async function readNDXAgentRuntimeSettings(userHome: string): Promise<NDXAgentRuntimeSettings> {
  return settingsDocumentToAgentRuntimeSettings(await readNDXSettingsDocument(userHome));
}

export function settingsDocumentToAgentRuntimeSettings(settings: NDXSettingsDocument): NDXAgentRuntimeSettings {
  const runtime = settings.runtime;
  const embeddings = parseEmbeddingSettings(settings.embeddings, settings.providers);
  const hooks = parseHookSettings(settings.hooks);
  const promptRewriteModel = promptRewriteModelSetting(settings.tools);
  const maxModelIterations = runtime && typeof runtime === "object" && !Array.isArray(runtime) ? runtime.maxModelIterations : undefined;
  const loopDetectionInterval = runtime && typeof runtime === "object" && !Array.isArray(runtime) ? runtime.loopDetectionInterval : undefined;
  return {
    maxModelIterations: typeof maxModelIterations === "number" && Number.isInteger(maxModelIterations) && maxModelIterations > 0
      ? maxModelIterations
      : DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: typeof loopDetectionInterval === "number" && Number.isInteger(loopDetectionInterval)
      ? loopDetectionInterval
      : DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    ...(embeddings ? { embeddings } : {}),
    ...(hooks ? { hooks } : {}),
    tools: {
      ...(promptRewriteModel ? { prompt_rewrite: { model: promptRewriteModel } } : {})
    }
  };
}

export function defaultAgentRuntimeSettings(): NDXAgentRuntimeSettings {
  return {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    tools: {}
  };
}

export function normalizeSettingsModalities(value: unknown): NDXSettingsModality[] {
  if (!Array.isArray(value)) return ["text"];
  return [...new Set([...value, "text"])].filter((item): item is NDXSettingsModality => item === "text" || item === "image" || item === "file");
}

export function settingsProviderUrl(provider: NDXSettingsProvider | undefined): string {
  return typeof provider?.url === "string" && provider.url.trim()
    ? provider.url.trim()
    : typeof provider?.baseUrl === "string" && provider.baseUrl.trim()
      ? provider.baseUrl.trim()
      : "";
}

export function settingsProviderToken(provider: NDXSettingsProvider | undefined): string {
  return typeof provider?.token === "string" ? provider.token : typeof provider?.key === "string" ? provider.key : typeof provider?.apiKey === "string" ? provider.apiKey : "";
}

export function settingsProviderRow(title: string, provider: NDXSettingsProvider): NDXSettingsProviderRow | undefined {
  const url = settingsProviderUrl(provider);
  if (!title.trim() || !url) return undefined;
  return {
    title: title.trim(),
    type: "openai",
    url,
    token: settingsProviderToken(provider)
  };
}

export function settingsEmbeddingRow(value: unknown): NDXSettingsEmbeddingSettingsRow | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as { provider?: unknown; model?: unknown };
  const provider = typeof record.provider === "string" ? record.provider.trim() : "";
  const model = typeof record.model === "string" ? record.model.trim() : "";
  return provider && model ? { provider, model } : undefined;
}

export function settingsDocumentRow(settings: NDXSettingsDocument): NDXSettingsDocumentRow {
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
      maxModelIterations: typeof runtime.maxModelIterations === "number" && Number.isInteger(runtime.maxModelIterations) && runtime.maxModelIterations > 0 ? runtime.maxModelIterations : DEFAULT_NDX_MAX_MODEL_ITERATIONS,
      loopDetectionInterval: typeof runtime.loopDetectionInterval === "number" && Number.isInteger(runtime.loopDetectionInterval) ? runtime.loopDetectionInterval : DEFAULT_NDX_LOOP_DETECTION_INTERVAL
    },
    tools: {
      prompt_rewrite: {
        model: typeof promptRewrite.model === "string" ? promptRewrite.model : ""
      }
    },
    hooks: {
      StreamGuard: {
        MAX_REASONING_LENGTH: typeof streamGuard.MAX_REASONING_LENGTH === "number" && Number.isInteger(streamGuard.MAX_REASONING_LENGTH) && streamGuard.MAX_REASONING_LENGTH > 0 ? streamGuard.MAX_REASONING_LENGTH : 240_000,
        analysisModel: typeof streamGuard.analysisModel === "string" ? streamGuard.analysisModel : ""
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

export function settingsModelRow(key: string, model: NDXSettingsModel): NDXSettingsModelRow | undefined {
  const provider = typeof model.provider === "string" ? model.provider.trim() : "";
  const name = typeof model.name === "string" ? model.name.trim() : key.trim();
  if (!provider || !name) return undefined;
  const contextsize = typeof model.maxContext === "number" ? model.maxContext : typeof model.contextsize === "number" ? model.contextsize : typeof model.contextSize === "number" ? model.contextSize : 100_000;
  return {
    key: key.trim(),
    provider,
    model: name,
    contextsize,
    modalities: normalizeSettingsModalities(model.modalities),
    ...settingsModelReasoningEffortField(model.reasoningEffort),
    ...optionalNumberField("temperature", model.temperature),
    ...optionalNumberField("topP", model.topP),
    ...optionalNumberField("topK", model.topK),
    ...optionalNumberField("minP", model.minP ?? model.MinP)
  };
}

export function settingsInferenceFields(input: NDXSettingsModelRow): Partial<NDXSettingsModel> {
  return {
    ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
    ...(typeof input.topP === "number" ? { topP: input.topP } : {}),
    ...(typeof input.topK === "number" ? { topK: input.topK } : {}),
    ...(typeof input.minP === "number" ? { MinP: input.minP } : {})
  };
}

export function settingsReasoningEffortField(value: unknown): Pick<NDXSettingsModel, "reasoningEffort"> {
  const effort = normalizeStoredReasoningEffort(value);
  return effort ? { reasoningEffort: effort } : {};
}

export function applyOptionalNumber(target: NDXSettingsModel, key: "temperature" | "topP" | "topK" | "MinP", value: number | null | undefined): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = value;
    return;
  }
  if (value === null) {
    delete target[key];
  }
}

export function applyOptionalReasoningEffort(target: NDXSettingsModel, value: NDXSettingsReasoningEffort | null | undefined): void {
  const effort = normalizeStoredReasoningEffort(value);
  if (effort) {
    target.reasoningEffort = effort;
    return;
  }
  if (value === null) {
    delete target.reasoningEffort;
  }
}

export function findSettingsModel(settings: NDXSettingsDocument, provider: string, model: string): { key: string; model: NDXSettingsModel } | undefined {
  for (const [key, value] of Object.entries(settings.models ?? {})) {
    const row = settingsModelRow(key, value);
    if (row?.provider === provider.trim() && row.model === model.trim()) {
      return { key, model: value };
    }
  }
  return undefined;
}

export function uniqueSettingsModelKey(settings: NDXSettingsDocument, model: string): string {
  const base = model.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "model";
  if (!settings.models?.[base]) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`;
    if (!settings.models[candidate]) return candidate;
  }
}

export function isEmbeddingModelName(model: string): boolean {
  return model.toLowerCase().includes("embedding");
}

export function resolveSettingsModelConfig(settings: NDXSettingsDocument, requested: string, fallbackContextSize: number): { key: string; model: NDXSettingsResolvedModelConfig } | undefined {
  const modelName = requested.trim();
  if (!modelName) return undefined;
  const resolved = settings.models?.[modelName]
    ? { key: modelName, value: settings.models[modelName] }
    : Object.entries(settings.models ?? {}).map(([key, value]) => ({ key, value })).find((entry) => String(entry.value.name ?? entry.key).trim() === modelName);
  const providerName = typeof resolved?.value.provider === "string" ? resolved.value.provider.trim() : "";
  const provider = providerName ? settings.providers?.[providerName] : undefined;
  const url = settingsProviderUrl(provider);
  if (!resolved || !providerName || !url) return undefined;
  return {
    key: resolved.key,
    model: {
      type: "openai",
      provider: providerName,
      model: typeof resolved.value.name === "string" && resolved.value.name.trim() ? resolved.value.name.trim() : resolved.key,
      url,
      token: settingsProviderToken(provider),
      contextsize: numberOrDefault(resolved.value.maxContext, numberOrDefault(resolved.value.contextsize, numberOrDefault(resolved.value.contextSize, fallbackContextSize))),
      modalities: normalizeSettingsModalities(resolved.value.modalities),
      ...settingsModelReasoningEffortField(resolved.value.reasoningEffort),
      ...optionalNumberField("temperature", resolved.value.temperature),
      ...optionalNumberField("topP", resolved.value.topP),
      ...optionalNumberField("topK", resolved.value.topK),
      ...optionalNumberField("minP", resolved.value.minP ?? resolved.value.MinP)
    }
  };
}

function parseEmbeddingSettings(value: unknown, providers?: unknown): NDXAgentRuntimeSettings["embeddings"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as { provider?: unknown; model?: unknown; url?: unknown; token?: unknown };
  if (typeof record.provider !== "string" || !record.provider.trim() || typeof record.model !== "string" || !record.model.trim()) return undefined;
  const provider = record.provider.trim();
  const providerSettings = providers && typeof providers === "object" && !Array.isArray(providers)
    ? (providers as Record<string, unknown>)[provider]
    : undefined;
  const providerRecord = providerSettings && typeof providerSettings === "object" && !Array.isArray(providerSettings)
    ? providerSettings as NDXSettingsProvider
    : undefined;
  const url = typeof record.url === "string" && record.url.trim() ? record.url.trim() : settingsProviderUrl(providerRecord) || undefined;
  const token = typeof record.token === "string" && record.token.trim() ? record.token.trim() : settingsProviderToken(providerRecord) || undefined;
  return {
    provider,
    model: record.model.trim(),
    ...(url ? { url } : {}),
    ...(token ? { token } : {})
  };
}

function parseHookSettings(value: unknown): NDXAgentRuntimeSettings["hooks"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const streamGuard = (value as { StreamGuard?: unknown }).StreamGuard;
  if (!streamGuard || typeof streamGuard !== "object" || Array.isArray(streamGuard)) return undefined;
  const maxReasoningLength = (streamGuard as { MAX_REASONING_LENGTH?: unknown }).MAX_REASONING_LENGTH;
  const analysisModel = (streamGuard as { analysisModel?: unknown }).analysisModel;
  const validMaxReasoningLength = typeof maxReasoningLength === "number" && Number.isInteger(maxReasoningLength) && maxReasoningLength > 0;
  const validAnalysisModel = typeof analysisModel === "string" && analysisModel.trim().length > 0;
  if (!validMaxReasoningLength && !validAnalysisModel) return undefined;
  return {
    StreamGuard: {
      MAX_REASONING_LENGTH: validMaxReasoningLength ? maxReasoningLength : 240_000,
      ...(validAnalysisModel ? { analysisModel: analysisModel.trim() } : {})
    }
  };
}

function promptRewriteModelSetting(tools: unknown): string | undefined {
  const promptRewrite = tools && typeof tools === "object" && !Array.isArray(tools)
    ? (tools as { prompt_rewrite?: unknown }).prompt_rewrite
    : undefined;
  const model = promptRewrite && typeof promptRewrite === "object" && !Array.isArray(promptRewrite)
    ? (promptRewrite as { model?: unknown }).model
    : undefined;
  return typeof model === "string" && model.trim() ? model.trim() : undefined;
}

function settingsModelReasoningEffortField(value: unknown): Pick<NDXSettingsModelRow, "reasoningEffort"> {
  const effort = normalizeStoredReasoningEffort(value);
  return effort ? { reasoningEffort: effort } : {};
}

function optionalNumberField<Key extends "temperature" | "topP" | "topK" | "minP">(key: Key, value: unknown): Partial<Record<Key, number>> {
  return typeof value === "number" && Number.isFinite(value) ? { [key]: value } as Partial<Record<Key, number>> : {};
}

function normalizeStoredReasoningEffort(value: unknown): NDXSettingsReasoningEffort | undefined {
  if (value === "nothink") return "low";
  if (value === "normal") return "medium";
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
