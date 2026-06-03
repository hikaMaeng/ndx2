import { inspectModelRequestPrefix } from "../../../turnloop/base/prefix/index.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

export const prefixDriftAuditHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.model.request.prefix_drift_audit",
  source: "system",
  run(context): NDXHookEffect {
    const drift = inspectModelRequestPrefix(context.previousModelRequestMessages, context.messages ?? []);
    return drift ? { prefixDrifts: [drift], diagnostics: [drift.message] } : { type: "noeffect" };
  }
};
