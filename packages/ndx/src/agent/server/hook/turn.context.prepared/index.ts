import { logNDXHookRunResult, runNDXHooks, type NDXHookCodeExecutor, type NDXHookContext, type NDXHookRunResult, type NDXHookRuntime } from "../index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export const systemHooks: NDXHookCodeExecutor[] = [];

export async function runTurnContextPreparedHook(
  runtime: NDXHookRuntime,
  context: Omit<NDXHookContext, "event">
): Promise<{ messages: ResponseInputItem[]; modelTools: Record<string, unknown>[]; stopTurn: boolean; finalAssistantText?: string; result: NDXHookRunResult }> {
  const messages = context.messages ?? [];
  const modelTools = context.modelTools ?? [];
  if ((runtime.plan[NDX_TURN_EVENT.ContextPrepared]?.length ?? 0) === 0) {
    return {
      messages,
      modelTools,
      stopTurn: false,
      result: {
        event: NDX_TURN_EVENT.ContextPrepared,
        executions: [],
        effect: { type: "noeffect", stopTurn: false }
      }
    };
  }
  const result = await runNDXHooks(runtime, NDX_TURN_EVENT.ContextPrepared, context);
  logNDXHookRunResult(context.database, context.session.sessionid, result);
  return {
    messages: result.effect.replaceMessages ?? (result.effect.appendMessages ? [...messages, ...result.effect.appendMessages] : messages),
    modelTools: result.effect.replaceModelTools ?? modelTools,
    stopTurn: Boolean(result.effect.stopTurn),
    finalAssistantText: result.effect.finalAssistantText,
    result
  };
}
