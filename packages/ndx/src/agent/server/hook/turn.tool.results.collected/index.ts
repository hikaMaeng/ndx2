import { loopDetectionHook } from "./loopDetection.js";
import { logNDXHookRunResult, runNDXHooks, type NDXHookCodeExecutor, type NDXHookContext, type NDXHookRunResult, type NDXHookRuntime } from "../index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import type { NDXToolExecutionResult } from "../../tool/types.js";

export const systemHooks: NDXHookCodeExecutor[] = [
  loopDetectionHook
];

export async function runToolResultsCollectedHook(
  runtime: NDXHookRuntime,
  context: Omit<NDXHookContext, "event">
): Promise<{ toolResults: NDXToolExecutionResult[]; stopTurn: boolean; finalAssistantText?: string; result: NDXHookRunResult }> {
  const toolResults = context.toolResults ?? [];
  if ((runtime.plan[NDX_TURN_EVENT.ToolResultsCollected]?.length ?? 0) === 0) {
    return {
      toolResults,
      stopTurn: false,
      result: {
        event: NDX_TURN_EVENT.ToolResultsCollected,
        executions: [],
        effect: { type: "noeffect", stopTurn: false }
      }
    };
  }
  const result = await runNDXHooks(runtime, NDX_TURN_EVENT.ToolResultsCollected, context);
  logNDXHookRunResult(context.database, context.session.sessionid, result);
  return {
    toolResults: result.effect.replaceToolResults ?? toolResults,
    stopTurn: Boolean(result.effect.stopTurn),
    finalAssistantText: result.effect.finalAssistantText,
    result
  };
}
