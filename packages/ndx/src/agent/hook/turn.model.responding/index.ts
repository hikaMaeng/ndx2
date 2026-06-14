// import { modelResponseStreamGuardHook } from "../base/streamGuard/index.js";
import { logNDXHookRunResult, runNDXHooks, type NDXHookCodeExecutor, type NDXHookContext, type NDXHookRunResult, type NDXHookRuntime } from "../index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";

export const systemHooks: NDXHookCodeExecutor[] = [
  // modelResponseStreamGuardHook
];

export async function runModelRespondingHook(
  runtime: NDXHookRuntime,
  context: Omit<NDXHookContext, "event">
): Promise<{ interruptModelResponse: boolean; interruptReason?: string; result: NDXHookRunResult }> {
  if ((runtime.plan[NDX_TURN_EVENT.ModelResponding]?.length ?? 0) === 0) {
    return {
      interruptModelResponse: false,
      result: {
        event: NDX_TURN_EVENT.ModelResponding,
        executions: [],
        effect: { type: "noeffect", stopTurn: false }
      }
    };
  }
  const result = await runNDXHooks(runtime, NDX_TURN_EVENT.ModelResponding, context);
  logNDXHookRunResult(context.database, context.session.sessionid, result);
  return {
    interruptModelResponse: Boolean(result.effect.interruptModelResponse),
    interruptReason: result.effect.interruptReason,
    result
  };
}
