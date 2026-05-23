import { emitEffect, readContext, readState } from "./lib.mjs";

const context = await readContext();
const state = await readState(context);
const diagnostics = [];

if (context.contextUsage?.percent >= 85) {
  diagnostics.push(`Context usage is high (${context.contextUsage.percent}%). Prefer compact diagnostic records over raw logs.`);
}
if (state.modelResponse?.shortToolResponseCount >= 3) {
  diagnostics.push("Model responses have been abnormally short while still requesting tools. Require a concise diagnosis before further edits.");
}

emitEffect(diagnostics.length > 0
  ? {
      type: "noeffect",
      appendMessages: [{ role: "system", content: `PROJECT HOOK GUARD:\n${diagnostics.map((item) => `- ${item}`).join("\n")}` }]
    }
  : { type: "noeffect" });
