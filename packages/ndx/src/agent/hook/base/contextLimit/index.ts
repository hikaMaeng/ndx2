import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { readTurnContextUsageStats, type NDXCompactReport } from "../../../compact/index.js";
import { calculateDetailedContextUsage, judgeContextAvailability } from "../../../contextusage/index.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

export type NDXContextLimitHookInsertionEvent = typeof NDX_TURN_EVENT.RequestReceived;

export function createContextLimitHook(input: {
  name: string;
  phase: NDXCompactReport["phase"];
}): NDXHookCodeExecutor {
  return {
    kind: "code",
    name: input.name,
    source: "system",
    async run(context): Promise<NDXHookEffect> {
      const contextUsage = context.messages
        ? calculateDetailedContextUsage(
            context.messages,
            context.session.model.contextsize,
            input.phase === "turn_start" ? context.requestText : "",
            context.modelTools ?? [],
            context.previousModelRequestStablePrefix
          )
        : context.contextUsage;
      if (!contextUsage || (context.sessionDataRows ?? []).length === 0) {
        return { type: "noeffect" };
      }
      const averageTurnTokens = (await readTurnContextUsageStats(context.database)).avgtokens || undefined;
      const availability = judgeContextAvailability(contextUsage, { averageTurnTokens });
      if (!availability.shouldCompact) {
        return { type: "noeffect" };
      }
      return {
        compact: {
          report: {
            phase: input.phase,
            reason: availability.reason,
            tokens: contextUsage.tokens,
            contextsize: contextUsage.contextsize,
            percent: contextUsage.percent,
            remainingTokens: availability.remainingTokens,
            requiredTokens: availability.requiredTokens,
            averageTurnTokens: availability.averageTurnTokens,
            outputReserveTokens: availability.outputReserveTokens
          }
        }
      };
    }
  };
}

export const requestContextLimitHook = createContextLimitHook({
  name: "system.turn.request.received.context_limit",
  phase: "turn_start"
});
