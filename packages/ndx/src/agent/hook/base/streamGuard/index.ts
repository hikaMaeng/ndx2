import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

export type NDXStreamGuardHookInsertionEvent = typeof NDX_TURN_EVENT.ModelResponding;

const MAX_REASONING_CHARS = 24_000;

type StreamGuardState = {
  textChars: number;
  maxReasoningChars: number;
};

const streamGuardState = new Map<string, StreamGuardState>();

export const modelResponseStreamGuardHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.model.responding.stream_guard",
  source: "system",
  run(context): NDXHookEffect {
    if (!context.modelResponse || typeof context.iteration !== "number") {
      return { type: "noeffect" };
    }

    const key = `${context.session.sessionid}:${context.iteration}`;
    const state = streamGuardState.get(key) ?? { textChars: 0, maxReasoningChars: 0 };
    if (context.modelResponse.type === "tool_call") {
      streamGuardState.delete(key);
      return { type: "noeffect" };
    }
    if (context.modelResponse.type === "text") {
      state.textChars = Math.max(state.textChars, context.modelResponse.content.length);
    }
    if (context.modelResponse.type === "reasoning") {
      state.textChars = Math.max(state.textChars, context.modelResponse.content.length);
      state.maxReasoningChars = Math.max(state.maxReasoningChars, context.modelResponse.summary.length);
    }

    if (context.modelResponse.type !== "reasoning" || state.textChars > 0) {
      streamGuardState.delete(key);
      return { type: "noeffect" };
    }
    streamGuardState.set(key, state);

    if (state.maxReasoningChars > MAX_REASONING_CHARS) {
      streamGuardState.delete(key);
      return interruptEffect(`model response reasoning exceeded ${MAX_REASONING_CHARS} characters before producing output.`);
    }
    return { type: "noeffect" };
  }
};

function interruptEffect(reason: string): NDXHookEffect {
  return {
    type: "noeffect",
    interruptModelResponse: true,
    interruptReason: reason,
    diagnostics: [reason]
  };
}
