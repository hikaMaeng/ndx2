import { logNDXHookRunResult, runNDXHooks, type NDXHookCodeExecutor, type NDXHookContext, type NDXHookRunResult, type NDXHookRuntime } from "../index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";

export const systemHooks: NDXHookCodeExecutor[] = [];

export async function runToolCalledHook(
  runtime: NDXHookRuntime,
  context: Omit<NDXHookContext, "event">
): Promise<{ toolCalls: unknown[]; stopTurn: boolean; finalAssistantText?: string; result: NDXHookRunResult }> {
  const toolCalls = context.toolCalls ?? [];
  if ((runtime.plan[NDX_TURN_EVENT.ToolCalled]?.length ?? 0) === 0) {
    return {
      toolCalls,
      stopTurn: false,
      result: {
        event: NDX_TURN_EVENT.ToolCalled,
        executions: [],
        effect: { type: "noeffect", stopTurn: false }
      }
    };
  }
  const result = await runNDXHooks(runtime, NDX_TURN_EVENT.ToolCalled, context);
  logNDXHookRunResult(context.database, context.session.sessionid, result);
  return {
    toolCalls: result.effect.replaceToolCalls ?? toolCalls,
    stopTurn: Boolean(result.effect.stopTurn),
    finalAssistantText: result.effect.finalAssistantText,
    result
  };
}
