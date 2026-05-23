import { skillMarkerHook } from "./skillMarkers.js";
import { logNDXHookRunResult, runNDXHooks, type NDXHookCodeExecutor, type NDXHookContext, type NDXHookRunResult, type NDXHookRuntime } from "../index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";

export const systemHooks: NDXHookCodeExecutor[] = [
  skillMarkerHook
];

export async function runTurnRequestReceivedHook(
  runtime: NDXHookRuntime,
  context: Omit<NDXHookContext, "event">
): Promise<{ requestText: string; stopTurn: boolean; finalAssistantText?: string; result: NDXHookRunResult }> {
  if ((runtime.plan[NDX_TURN_EVENT.RequestReceived]?.length ?? 0) === 0) {
    return {
      requestText: context.requestText,
      stopTurn: false,
      result: {
        event: NDX_TURN_EVENT.RequestReceived,
        executions: [],
        effect: { type: "noeffect", stopTurn: false }
      }
    };
  }
  const result = await runNDXHooks(runtime, NDX_TURN_EVENT.RequestReceived, context);
  logNDXHookRunResult(context.database, context.session.sessionid, result);
  return {
    requestText: result.effect.replaceRequestText ?? context.requestText,
    stopTurn: Boolean(result.effect.stopTurn),
    finalAssistantText: result.effect.finalAssistantText,
    result
  };
}
