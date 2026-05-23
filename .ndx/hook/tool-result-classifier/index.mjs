import { emitEffect, readContext, readState, stableFailureKey, summarizeCommandFailure, writeState } from "./lib.mjs";

const context = await readContext();
const state = await readState(context);
const failures = Array.isArray(context.toolResults) ? context.toolResults.filter((result) => !result.success) : [];

state.toolFailure = state.toolFailure || {};
if (failures.length === 0) {
  state.toolFailure.lastKey = "";
  state.toolFailure.repeatCount = 0;
  state.toolFailure.lastSummary = undefined;
  await writeState(context, state);
  emitEffect({ type: "noeffect" });
  process.exit(0);
}

const primary = failures[0];
const key = stableFailureKey(primary);
const repeatCount = state.toolFailure.lastKey === key ? (state.toolFailure.repeatCount || 0) + 1 : 1;
state.toolFailure = {
  lastKey: key,
  repeatCount,
  lastSummary: summarizeCommandFailure(primary),
  lastResult: {
    tool: primary.tool,
    status: primary.status,
    exitCode: primary.exitCode,
    output: primary.output
  }
};
await writeState(context, state);

emitEffect({
  type: "noeffect",
  diagnostics: [`tool failure classified: ${state.toolFailure.lastSummary.rootCause}`]
});
