import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { readTurnContextUsageStats, type NDXCompactReport } from "../../../compact/index.js";
import { judgeContextAvailability } from "../../../contextusage/index.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

export type NDXContextLimitHookInsertionEvent =
  | typeof NDX_TURN_EVENT.RequestReceived
  | typeof NDX_TURN_EVENT.ContextPrepared;

export function createContextLimitHook(input: {
  name: string;
  phase: NDXCompactReport["phase"];
  endTurn: boolean;
}): NDXHookCodeExecutor {
  return {
    kind: "code",
    name: input.name,
    source: "system",
    async run(context): Promise<NDXHookEffect> {
      if (!context.contextUsage || (context.sessionDataRows ?? []).length === 0) {
        return { type: "noeffect" };
      }
      const averageTurnTokens = (await readTurnContextUsageStats(context.database)).avgtokens || undefined;
      const availability = judgeContextAvailability(context.contextUsage, { averageTurnTokens });
      if (!availability.shouldCompact) {
        return { type: "noeffect" };
      }
      return {
        compact: {
          endTurn: input.endTurn,
          report: {
            phase: input.phase,
            reason: availability.reason,
            tokens: context.contextUsage.tokens,
            contextsize: context.contextUsage.contextsize,
            percent: context.contextUsage.percent,
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
  phase: "turn_start",
  endTurn: false
});

export const contextPreparedContextLimitHook = createContextLimitHook({
  name: "system.turn.context.prepared.context_limit",
  phase: "iteration",
  endTurn: true
});
