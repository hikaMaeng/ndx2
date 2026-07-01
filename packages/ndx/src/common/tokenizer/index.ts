import { getEncoding } from "js-tiktoken";

export type NDXTokenEncodingName = "o200k_base" | "cl100k_base" | "p50k_base" | "p50k_edit" | "r50k_base" | "gpt2";

export type NDXTokenCountInput = {
  text: string;
  modelName?: string;
  encodingName?: NDXTokenEncodingName;
  fallbackBytesPerToken?: number;
};

export type NDXTokenCount = {
  tokens: number;
  encodingName: NDXTokenEncodingName;
  method: "bpe" | "byte_heuristic";
};

const DEFAULT_ENCODING_NAME: NDXTokenEncodingName = "o200k_base";
const DEFAULT_FALLBACK_BYTES_PER_TOKEN = 4;
const encoders = new Map<NDXTokenEncodingName, ReturnType<typeof getEncoding>>();

export function countTextTokens(input: NDXTokenCountInput): NDXTokenCount {
  const encodingName = input.encodingName ?? encodingNameForModel(input.modelName);
  try {
    return {
      tokens: encoderForName(encodingName).encode(input.text).length,
      encodingName,
      method: "bpe"
    };
  } catch {
    return {
      tokens: Math.ceil(Buffer.byteLength(input.text, "utf8") / Math.max(1, input.fallbackBytesPerToken ?? DEFAULT_FALLBACK_BYTES_PER_TOKEN)),
      encodingName,
      method: "byte_heuristic"
    };
  }
}

export function estimateTextTokens(text: string, options: Omit<NDXTokenCountInput, "text"> = {}): number {
  return countTextTokens({ ...options, text }).tokens;
}

export function encodingNameForModel(modelName?: string): NDXTokenEncodingName {
  const normalized = modelName?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return DEFAULT_ENCODING_NAME;
  }
  if (normalized.includes("text-davinci-002") || normalized.includes("text-davinci-003") || normalized.includes("code-davinci") || normalized.includes("code-cushman")) {
    return "p50k_base";
  }
  if (normalized.includes("gpt-3") || normalized.includes("gpt-4-turbo") || normalized.includes("gpt-4-") || normalized.includes("text-embedding")) {
    return "cl100k_base";
  }
  return DEFAULT_ENCODING_NAME;
}

function encoderForName(encodingName: NDXTokenEncodingName): ReturnType<typeof getEncoding> {
  const existing = encoders.get(encodingName);
  if (existing) {
    return existing;
  }
  const created = getEncoding(encodingName);
  encoders.set(encodingName, created);
  return created;
}
