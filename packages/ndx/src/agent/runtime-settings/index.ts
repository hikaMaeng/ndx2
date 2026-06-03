import { promises as fs } from "node:fs";
import path from "node:path";

export const DEFAULT_NDX_MAX_MODEL_ITERATIONS = 500;
export const DEFAULT_NDX_LOOP_DETECTION_INTERVAL = 50;

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
};

export async function readAgentRuntimeSettings(userHome: string): Promise<NDXAgentRuntimeSettings> {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(userHome, ".ndx", "settings.json"), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return defaultAgentRuntimeSettings();
    const settings = parsed as { runtime?: unknown; embeddings?: unknown; providers?: unknown; tools?: unknown };
    const runtime = settings.runtime;
    const embeddings = parseEmbeddingSettings(settings.embeddings, settings.providers);
    const tools = settings.tools;
    const promptRewrite = tools && typeof tools === "object" && !Array.isArray(tools)
      ? (tools as { prompt_rewrite?: unknown }).prompt_rewrite
      : undefined;
    const promptRewriteModel = promptRewrite && typeof promptRewrite === "object" && !Array.isArray(promptRewrite)
      ? (promptRewrite as { model?: unknown }).model
      : undefined;
    if (!runtime || typeof runtime !== "object") {
      return {
        ...defaultAgentRuntimeSettings(),
        ...(embeddings ? { embeddings } : {}),
        tools: {
          ...(typeof promptRewriteModel === "string" && promptRewriteModel.trim() ? { prompt_rewrite: { model: promptRewriteModel.trim() } } : {})
        }
      };
    }
    const maxModelIterations = (runtime as { maxModelIterations?: unknown }).maxModelIterations;
    const loopDetectionInterval = (runtime as { loopDetectionInterval?: unknown }).loopDetectionInterval;
    return {
      maxModelIterations: typeof maxModelIterations === "number" && Number.isInteger(maxModelIterations) && maxModelIterations > 0
        ? maxModelIterations
        : DEFAULT_NDX_MAX_MODEL_ITERATIONS,
      loopDetectionInterval: typeof loopDetectionInterval === "number" && Number.isInteger(loopDetectionInterval)
        ? loopDetectionInterval
        : DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
      ...(embeddings ? { embeddings } : {}),
      tools: {
        ...(typeof promptRewriteModel === "string" && promptRewriteModel.trim() ? { prompt_rewrite: { model: promptRewriteModel.trim() } } : {})
      }
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultAgentRuntimeSettings();
    }
    throw error;
  }
}

function defaultAgentRuntimeSettings(): NDXAgentRuntimeSettings {
  return {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL,
    tools: {}
  };
}

function parseEmbeddingSettings(value: unknown, providers?: unknown): NDXAgentRuntimeSettings["embeddings"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as { provider?: unknown; model?: unknown; url?: unknown; token?: unknown };
  if (typeof record.provider !== "string" || !record.provider.trim() || typeof record.model !== "string" || !record.model.trim()) {
    return undefined;
  }
  const provider = record.provider.trim();
  const providerSettings = providers && typeof providers === "object" && !Array.isArray(providers)
    ? (providers as Record<string, unknown>)[provider]
    : undefined;
  const providerRecord = providerSettings && typeof providerSettings === "object" && !Array.isArray(providerSettings)
    ? providerSettings as { url?: unknown; key?: unknown; apiKey?: unknown; token?: unknown }
    : undefined;
  const url = typeof record.url === "string" && record.url.trim()
    ? record.url.trim()
    : typeof providerRecord?.url === "string" && providerRecord.url.trim()
      ? providerRecord.url.trim()
      : undefined;
  const token = typeof record.token === "string" && record.token.trim()
    ? record.token.trim()
    : typeof providerRecord?.token === "string" && providerRecord.token.trim()
      ? providerRecord.token.trim()
      : typeof providerRecord?.apiKey === "string" && providerRecord.apiKey.trim()
        ? providerRecord.apiKey.trim()
        : typeof providerRecord?.key === "string" && providerRecord.key.trim()
          ? providerRecord.key.trim()
          : undefined;
  return {
    provider,
    model: record.model.trim(),
    ...(url ? { url } : {}),
    ...(token ? { token } : {})
  };
}
