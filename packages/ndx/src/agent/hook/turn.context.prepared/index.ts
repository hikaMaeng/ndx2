import { cotWorkReminderHook } from "../../tool/base/cot_work/reminderHook.js";
import { inlineInputImagesHook } from "../base/inlineInputImages/index.js";
import { logNDXHookRunResult, runNDXHooks, type NDXHookCodeExecutor, type NDXHookContext, type NDXHookRunResult, type NDXHookRuntime } from "../index.js";
import { inspectContextPreparedMessagesPrefix, snapshotModelRequestStablePrefix } from "../base/prefixDrift/index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export const systemHooks: NDXHookCodeExecutor[] = [
  cotWorkReminderHook,
  inlineInputImagesHook
];

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
  const originalStablePrefix = snapshotModelRequestStablePrefix(messages);
  const result = await runNDXHooks(runtime, NDX_TURN_EVENT.ContextPrepared, context);
  logNDXHookRunResult(context.database, context.session.sessionid, result);
  const nextMessages = result.effect.replaceMessages ?? (result.effect.appendMessages ? [...messages, ...result.effect.appendMessages] : messages);
  const drift = inspectContextPreparedMessagesPrefix(originalStablePrefix, nextMessages);
  if (drift) {
    result.effect.diagnostics = [...(result.effect.diagnostics ?? []), drift.message];
    context.database.logger?.warn(NDX_TURN_EVENT.PrefixDrift, {
      sessionid: context.session.sessionid,
      iteration: context.iteration,
      ...drift
    });
  }
  return {
    messages: nextMessages,
    modelTools: result.effect.replaceModelTools ?? modelTools,
    stopTurn: Boolean(result.effect.stopTurn),
    finalAssistantText: result.effect.finalAssistantText,
    result
  };
}
