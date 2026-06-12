import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { readAgentRuntimeSettings } from "../../../runtime-settings/index.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

export type NDXStreamGuardHookInsertionEvent = typeof NDX_TURN_EVENT.ModelResponding;

const MAX_REASONING_CHARS = 240_000;
const REPEATED_REASONING_BLOCK_WINDOWS = [80, 160, 320, 640] as const;
const REPEATED_REASONING_DENSITY_RECENT_CHARS = 4_000;
const REPEATED_REASONING_DENSITY_MIN_SHINGLES = 120;
const REPEATED_REASONING_DENSITY_MAX_UNIQUE_RATIO = 0.65;
const REPEATED_REASONING_DENSITY_MIN_DUPLICATE_COUNT = 3;
const NO_OUTPUT_REASONING_MAX_ELAPSED_MS = 90_000;
const NO_OUTPUT_REASONING_MAX_SEQUENCE = 1_000;
const NO_OUTPUT_REASONING_MAX_CHARS = 8_000;
const META_REASONING_MIN_CHARS = 600;
const META_REASONING_MIN_SIGNAL_COUNT = 4;
const META_REASONING_SIGNALS = [
  /\bwe need respond to user\b/i,
  /\bneed continue task\b/i,
  /\blast actual output\b/i,
  /\bactual output from\b/i,
  /\btranscript\b/i,
  /\bassistant-to-user\b/i,
  /\buser reminders?\b/i,
  /\bfunction outputs?\b/i,
  /\btool call(?:s| attempts?)?\b/i,
  /\binvalid json\b/i,
  /\bbad control character\b/i,
  /\bcommand string\b/i,
  /\bjson string\b/i,
  /\binterface\b.*\becho/i,
  /\btool result\b.*\binvalid/i
] as const;

type StreamGuardState = {
  maxReasoningObservedChars: number;
  maxReasoningAllowedChars: number;
};

const streamGuardState = new Map<string, StreamGuardState>();

export const modelResponseStreamGuardHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.model.responding.stream_guard",
  source: "system",
  async run(context): Promise<NDXHookEffect> {
    if (!context.modelResponse || typeof context.iteration !== "number") {
      return { type: "noeffect" };
    }

    const key = `${context.session.sessionid}:${context.iteration}`;
    if (context.modelResponse.type === "tool_call") {
      streamGuardState.delete(key);
      return { type: "noeffect" };
    }
    if (context.modelResponse.type === "text") {
      streamGuardState.delete(key);
      return { type: "noeffect" };
    }

    if (context.modelResponse.content.length > 0) {
      streamGuardState.delete(key);
      return { type: "noeffect" };
    }
    const existingState = streamGuardState.get(key);
    const state = existingState ?? {
      maxReasoningObservedChars: 0,
      maxReasoningAllowedChars: await readMaxReasoningAllowedChars(context.userHome)
    };
    state.maxReasoningObservedChars = Math.max(state.maxReasoningObservedChars, context.modelResponse.summary.length);
    streamGuardState.set(key, state);

    if (hasMetaExecutionReasoning(context.modelResponse.summary)) {
      streamGuardState.delete(key);
      return interruptEffect("model response reasoning got stuck analyzing tool-call or transcript state before producing output.");
    }
    if (hasRepeatedReasoningParagraph(context.modelResponse.summary)) {
      streamGuardState.delete(key);
      return interruptEffect("model response reasoning repeated the same paragraph before producing output.");
    }
    if (hasRepeatedReasoningTailBlock(context.modelResponse.summary)) {
      streamGuardState.delete(key);
      return interruptEffect("model response reasoning repeated the same text block before producing output.");
    }
    if (hasDenseRepeatedReasoning(context.modelResponse.summary)) {
      streamGuardState.delete(key);
      return interruptEffect("model response reasoning repeated too densely before producing output.");
    }
    if (hasExcessiveNoOutputReasoning(context.modelResponse.summary, context.modelResponse.elapsedMs, context.modelResponse.sequence)) {
      streamGuardState.delete(key);
      return interruptEffect("model response reasoning streamed too long before producing output.");
    }
    if (state.maxReasoningObservedChars > state.maxReasoningAllowedChars) {
      streamGuardState.delete(key);
      return interruptEffect(`model response reasoning exceeded ${state.maxReasoningAllowedChars} characters before producing output.`);
    }
    return { type: "noeffect" };
  }
};

async function readMaxReasoningAllowedChars(userHome: string): Promise<number> {
  const settings = await readAgentRuntimeSettings(userHome);
  return settings.hooks?.StreamGuard?.MAX_REASONING_LENGTH ?? MAX_REASONING_CHARS;
}

function hasRepeatedReasoningParagraph(summary: string): boolean {
  const seen = new Set<string>();
  for (const paragraph of summary
    .split(/\n\s*\n/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 0)) {
    if (seen.has(paragraph)) {
      return true;
    }
    seen.add(paragraph);
  }
  return false;
}

function hasMetaExecutionReasoning(summary: string): boolean {
  if (summary.length < META_REASONING_MIN_CHARS) {
    return false;
  }
  let signalCount = 0;
  for (const signal of META_REASONING_SIGNALS) {
    if (signal.test(summary)) {
      signalCount += 1;
    }
  }
  return signalCount >= META_REASONING_MIN_SIGNAL_COUNT;
}

function hasRepeatedReasoningTailBlock(summary: string): boolean {
  const normalized = summary.replace(/\s+/g, " ").trim();
  for (const size of REPEATED_REASONING_BLOCK_WINDOWS) {
    if (normalized.length < size * 2) {
      continue;
    }
    const block = normalized.slice(normalized.length - size);
    if (new Set(block).size < minUniqueCharactersForRepeatedBlock(size)) {
      continue;
    }
    if (normalized.slice(0, normalized.length - size).includes(block)) {
      return true;
    }
  }
  return false;
}

function minUniqueCharactersForRepeatedBlock(size: number): number {
  return size < 160 ? 18 : 24;
}

function hasDenseRepeatedReasoning(summary: string): boolean {
  const normalized = summary.replace(/\s+/g, " ").trim();
  const recent = normalized.slice(-REPEATED_REASONING_DENSITY_RECENT_CHARS).toLowerCase();
  const tokens = recent.match(/[a-z0-9가-힣_`'.-]+/g) ?? [];
  if (tokens.length < REPEATED_REASONING_DENSITY_MIN_SHINGLES) {
    return false;
  }

  const shingleSize = 10;
  const counts = new Map<string, number>();
  for (let index = 0; index <= tokens.length - shingleSize; index += 1) {
    const shingle = tokens.slice(index, index + shingleSize).join(" ");
    counts.set(shingle, (counts.get(shingle) ?? 0) + 1);
  }

  const total = Math.max(0, tokens.length - shingleSize + 1);
  if (total < REPEATED_REASONING_DENSITY_MIN_SHINGLES) {
    return false;
  }
  const maxDuplicateCount = Math.max(...counts.values());
  const uniqueRatio = counts.size / total;
  return maxDuplicateCount >= REPEATED_REASONING_DENSITY_MIN_DUPLICATE_COUNT && uniqueRatio <= REPEATED_REASONING_DENSITY_MAX_UNIQUE_RATIO;
}

function hasExcessiveNoOutputReasoning(summary: string, elapsedMs: number, sequence: number): boolean {
  return elapsedMs >= NO_OUTPUT_REASONING_MAX_ELAPSED_MS &&
    sequence >= NO_OUTPUT_REASONING_MAX_SEQUENCE &&
    summary.length >= NO_OUTPUT_REASONING_MAX_CHARS;
}

function interruptEffect(reason: string): NDXHookEffect {
  return {
    type: "noeffect",
    interruptModelResponse: true,
    interruptReason: reason,
    diagnostics: [reason]
  };
}
