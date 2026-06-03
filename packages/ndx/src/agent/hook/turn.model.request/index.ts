import { prefixDriftAuditHook } from "../base/prefixDrift/index.js";
import { logNDXHookRunResult, runNDXHooks, type NDXHookCodeExecutor, type NDXHookContext, type NDXHookRunResult, type NDXHookRuntime } from "../index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";

export const systemHooks: NDXHookCodeExecutor[] = [
  prefixDriftAuditHook
];

export async function runTurnModelRequestHook(
  runtime: NDXHookRuntime,
  context: Omit<NDXHookContext, "event">
): Promise<{ result: NDXHookRunResult }> {
  const result = await runNDXHooks(runtime, NDX_TURN_EVENT.ModelRequest, context);
  logNDXHookRunResult(context.database, context.session.sessionid, result);
  return { result };
}
