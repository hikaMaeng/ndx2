import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { recordTurnContextUsage } from "../../../compact/index.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

export type NDXTurnContextUsageHookInsertionEvent = typeof NDX_TURN_EVENT.TurnEnd;

export const turnEndContextUsageHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.end.turn_context_usage",
  source: "system",
  run(context): NDXHookEffect {
    if (!context.input || !context.assistant) {
      return { type: "noeffect" };
    }
    setImmediate(() => {
      void recordTurnContextUsage(context.database, context.input!, context.assistant!).catch((error: unknown) => {
        context.database.logger?.debug("agent.server.turn_context_usage.update_failed", {
          sessionid: context.session.sessionid,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    });
    return { type: "noeffect" };
  }
};
