import {
  applyOptionalNumber,
  applyOptionalReasoningEffort,
  findSettingsModel,
  isEmbeddingModelName,
  normalizeSettingsModalities,
  readNDXSettingsDocument,
  settingsInferenceFields,
  settingsModelRow,
  settingsReasoningEffortField,
  uniqueSettingsModelKey,
  writeNDXSettingsDocument,
  type NDXSettingsModelRow,
  type NDXSettingsProviderRow
} from "../../../../common/settings/index.js";
import { fetchProviderModels } from "./upstream.js";

export async function listSettingsWebModel(userHome: string, provider: string): Promise<NDXSettingsModelRow[]> {
  const settings = await readNDXSettingsDocument(userHome);
  const providerName = provider.trim();
  return Object.entries(settings.models ?? {})
    .map(([key, model]) => settingsModelRow(key, model))
    .filter((model): model is NDXSettingsModelRow => model !== undefined && model.provider === providerName)
    .sort((left, right) => left.model.localeCompare(right.model));
}

export async function listSettingsWebEmbeddingModel(userHome: string, provider: string): Promise<NDXSettingsModelRow[]> {
  return (await listSettingsWebModel(userHome, provider)).filter((model) => isEmbeddingModelName(model.model));
}

export async function createSettingsWebModel(userHome: string, input: NDXSettingsModelRow): Promise<NDXSettingsModelRow> {
  const settings = await readNDXSettingsDocument(userHome);
  settings.providers = settings.providers ?? {};
  if (!settings.providers[input.provider.trim()]) throw new Error(`settings provider not found: ${input.provider}`);
  settings.models = settings.models ?? {};
  const key = uniqueSettingsModelKey(settings, input.model.trim());
  settings.models[key] = {
    name: input.model.trim(),
    provider: input.provider.trim(),
    maxContext: input.contextsize,
    modalities: normalizeSettingsModalities(input.modalities),
    ...settingsReasoningEffortField(input.reasoningEffort),
    ...settingsInferenceFields(input)
  };
  if (!settings.model) settings.model = key;
  await writeNDXSettingsDocument(userHome, settings);
  const row = settingsModelRow(key, settings.models[key]);
  if (!row) throw new Error("settings model upsert returned no row.");
  return row;
}

export async function createSettingsWebEmbeddingModel(userHome: string, input: Pick<NDXSettingsModelRow, "provider" | "model">): Promise<NDXSettingsModelRow> {
  if (!isEmbeddingModelName(input.model)) throw new Error("embedding model name must include embedding.");
  const settings = await readNDXSettingsDocument(userHome);
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
  await writeNDXSettingsDocument(userHome, settings);
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
}): Promise<NDXSettingsModelRow> {
  const settings = await readNDXSettingsDocument(userHome);
  const found = findSettingsModel(settings, provider, model);
  if (!found) throw new Error(`settings model not found: ${provider}/${model}`);
  settings.models = settings.models ?? {};
  settings.models[found.key] = {
    ...found.model,
    maxContext: input.contextsize,
    modalities: input.modalities ? normalizeSettingsModalities(input.modalities) : normalizeSettingsModalities(found.model.modalities)
  };
  applyOptionalReasoningEffort(settings.models[found.key], input.reasoningEffort);
  applyOptionalNumber(settings.models[found.key], "temperature", input.temperature);
  applyOptionalNumber(settings.models[found.key], "topP", input.topP);
  applyOptionalNumber(settings.models[found.key], "topK", input.topK);
  applyOptionalNumber(settings.models[found.key], "MinP", input.minP);
  delete settings.models[found.key].minP;
  await writeNDXSettingsDocument(userHome, settings);
  const row = settingsModelRow(found.key, settings.models[found.key]);
  if (!row) throw new Error(`settings model not found: ${provider}/${model}`);
  return row;
}

export async function deleteSettingsWebModel(userHome: string, provider: string, model: string): Promise<void> {
  const settings = await readNDXSettingsDocument(userHome);
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
  await writeNDXSettingsDocument(userHome, settings);
}

export async function syncSettingsWebProviderModels(userHome: string, provider: NDXSettingsProviderRow): Promise<NDXSettingsModelRow[]> {
  const settings = await readNDXSettingsDocument(userHome);
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
  await writeNDXSettingsDocument(userHome, settings);
  return listSettingsWebModel(userHome, provider.title);
}

export async function syncSettingsWebProviderEmbeddingModels(userHome: string, provider: NDXSettingsProviderRow): Promise<NDXSettingsModelRow[]> {
  const settings = await readNDXSettingsDocument(userHome);
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
  await writeNDXSettingsDocument(userHome, settings);
  return listSettingsWebEmbeddingModel(userHome, provider.title);
}
