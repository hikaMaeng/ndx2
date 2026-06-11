import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { readAgentRuntimeSettings } from "../../../runtime-settings/index.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

export type NDXStreamGuardHookInsertionEvent = typeof NDX_TURN_EVENT.ModelResponding;

const MAX_REASONING_CHARS = 240_000;
const REPEATED_REASONING_BLOCK_WINDOWS = [160, 320, 640] as const;

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

    if (hasRepeatedReasoningParagraph(context.modelResponse.summary)) {
      streamGuardState.delete(key);
      return interruptEffect("model response reasoning repeated the same paragraph before producing output.");
    }
    if (hasRepeatedReasoningTailBlock(context.modelResponse.summary)) {
      streamGuardState.delete(key);
      return interruptEffect("model response reasoning repeated the same text block before producing output.");
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

function hasRepeatedReasoningTailBlock(summary: string): boolean {
  const normalized = summary.replace(/\s+/g, " ").trim();
  for (const size of REPEATED_REASONING_BLOCK_WINDOWS) {
    if (normalized.length < size * 2) {
      continue;
    }
    const block = normalized.slice(normalized.length - size);
    if (new Set(block).size < 24) {
      continue;
    }
    if (normalized.slice(0, normalized.length - size).includes(block)) {
      return true;
    }
  }
  return false;
}

function interruptEffect(reason: string): NDXHookEffect {
  return {
    type: "noeffect",
    interruptModelResponse: true,
    interruptReason: reason,
    diagnostics: [reason]
  };
}
