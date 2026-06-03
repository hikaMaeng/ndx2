import { turnEndAssistantSessionSearchHook, turnEndInputSessionSearchHook } from "../../tool/base/session_history/sessionSearchHook.js";
import { turnEndContextUsageHook } from "../base/turnContextUsage/index.js";
import { logNDXHookRunResult, runNDXHooks, type NDXHookCodeExecutor, type NDXHookContext, type NDXHookRunResult, type NDXHookRuntime } from "../index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";

export const systemHooks: NDXHookCodeExecutor[] = [
  turnEndInputSessionSearchHook,
  turnEndAssistantSessionSearchHook,
  turnEndContextUsageHook
];

export async function runTurnEndHook(runtime: NDXHookRuntime, context: Omit<NDXHookContext, "event">): Promise<{ result: NDXHookRunResult }> {
  if ((runtime.plan[NDX_TURN_EVENT.TurnEnd]?.length ?? 0) === 0) {
    return {
      result: {
        event: NDX_TURN_EVENT.TurnEnd,
        executions: [],
        effect: { type: "noeffect", stopTurn: false }
      }
    };
  }
  const result = await runNDXHooks(runtime, NDX_TURN_EVENT.TurnEnd, context);
  logNDXHookRunResult(context.database, context.session.sessionid, result);
  return { result };
}
