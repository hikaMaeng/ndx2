import { emitEffect, readContext, readState, writeState } from "./lib.mjs";

const context = await readContext();
const state = await readState(context);
const text = String(context.assistantText || "").trim();
const toolCallCount = Array.isArray(context.toolCalls) ? context.toolCalls.length : 0;

state.modelResponse = state.modelResponse || {};
if (toolCallCount > 0 && text.length <= 2) {
  state.modelResponse.shortToolResponseCount = (state.modelResponse.shortToolResponseCount || 0) + 1;
} else {
  state.modelResponse.shortToolResponseCount = 0;
}
await writeState(context, state);

emitEffect({ type: "noeffect" });
