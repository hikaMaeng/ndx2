import { logNDXHookRunResult, runNDXHooks, type NDXHookCodeExecutor, type NDXHookContext, type NDXHookRunResult, type NDXHookRuntime } from "../index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";

export const systemHooks: NDXHookCodeExecutor[] = [];

export async function runResponsePreparedHook(
  runtime: NDXHookRuntime,
  context: Omit<NDXHookContext, "event">
): Promise<{ assistantText: string; nextRequestText?: string; stopTurn: boolean; result: NDXHookRunResult }> {
  const assistantText = context.assistantText ?? "";
  if ((runtime.plan[NDX_TURN_EVENT.ResponsePrepared]?.length ?? 0) === 0) {
    return {
      assistantText,
      stopTurn: false,
      result: {
        event: NDX_TURN_EVENT.ResponsePrepared,
        executions: [],
        effect: { type: "noeffect", stopTurn: false }
      }
    };
  }
  const result = await runNDXHooks(runtime, NDX_TURN_EVENT.ResponsePrepared, context);
  logNDXHookRunResult(context.database, context.session.sessionid, result);
  return {
    assistantText: result.effect.finalAssistantText ?? assistantText,
    nextRequestText: typeof result.effect.nextRequestText === "string" && result.effect.nextRequestText.trim().length > 0 ? result.effect.nextRequestText.trim() : undefined,
    stopTurn: Boolean(result.effect.stopTurn),
    result
  };
}
