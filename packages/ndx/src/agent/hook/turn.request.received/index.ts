import { requestContextLimitHook } from "../base/contextLimit/index.js";
import { rewriterMarkerHook } from "../base/rewriterMarker/index.js";
import { skillMarkerHook } from "../base/skillMarkers/index.js";
import { thinkingMarkerHook } from "../base/thinkingMarkers/index.js";
import { logNDXHookRunResult, runNDXHooks, type NDXHookCodeExecutor, type NDXHookContext, type NDXHookRunResult, type NDXHookRuntime } from "../index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";

export const systemHooks: NDXHookCodeExecutor[] = [
  thinkingMarkerHook,
  skillMarkerHook,
  requestContextLimitHook,
  rewriterMarkerHook
];

export async function runTurnRequestReceivedHook(
  runtime: NDXHookRuntime,
  context: Omit<NDXHookContext, "event">
): Promise<{ requestText: string; compact: NDXHookRunResult["effect"]["compact"]; stopTurn: boolean; finalAssistantText?: string; result: NDXHookRunResult }> {
  if ((runtime.plan[NDX_TURN_EVENT.RequestReceived]?.length ?? 0) === 0) {
    return {
      requestText: context.requestText,
      compact: undefined,
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
    compact: result.effect.compact,
    stopTurn: Boolean(result.effect.stopTurn),
    finalAssistantText: result.effect.finalAssistantText,
    result
  };
}
