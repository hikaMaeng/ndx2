import type { NDXAgentWebModel, NDXAgentWebModelConfig, NDXAgentWebProvider, NDXReasoningEffort } from "ndx/webclient/common";

export type ProviderBundle = {
  provider: NDXAgentWebProvider;
  models: NDXAgentWebModel[];
};

export type SelectedModelConfig = {
  provider: string;
  model: string;
  contextsize: number;
  url: string;
  token: string;
  modalities: Array<"text" | "image" | "file">;
  reasoningEffort: NDXReasoningEffort;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export const DEFAULT_MODEL: SelectedModelConfig = {
  provider: "",
  model: "",
  contextsize: 100_000,
  url: "",
  token: "",
  modalities: ["text"],
  reasoningEffort: "medium"
};

export function toModelConfig(model: SelectedModelConfig) {
  return {
    type: "openai" as const,
    provider: model.provider,
    model: model.model,
    url: model.url ?? "",
    token: model.token ?? "",
    contextsize: typeof model.contextsize === "number" ? model.contextsize : 100_000,
    modalities: model.modalities ?? ["text"],
    reasoningEffort: normalizeReasoningEffort(model.reasoningEffort),
    ...(typeof model.temperature === "number" ? { temperature: model.temperature } : {}),
    ...(typeof model.topP === "number" ? { topP: model.topP } : {}),
    ...(typeof model.topK === "number" ? { topK: model.topK } : {}),
    ...(typeof model.minP === "number" ? { minP: model.minP } : {})
  };
}

export function fromModelConfig(model: NDXAgentWebModelConfig): SelectedModelConfig {
  return {
    provider: model.provider ?? "",
    model: model.model,
    contextsize: typeof model.contextsize === "number" ? model.contextsize : 100_000,
    url: model.url ?? "",
    token: model.token ?? "",
    modalities: model.modalities ?? ["text"],
    reasoningEffort: normalizeReasoningEffort(model.reasoningEffort),
    ...(typeof model.temperature === "number" ? { temperature: model.temperature } : {}),
    ...(typeof model.topP === "number" ? { topP: model.topP } : {}),
    ...(typeof model.topK === "number" ? { topK: model.topK } : {}),
    ...(typeof model.minP === "number" ? { minP: model.minP } : {})
  };
}

export function normalizeReasoningEffort(value: unknown): NDXReasoningEffort {
  if (value === "nothink") return "low";
  if (value === "normal") return "medium";
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}
