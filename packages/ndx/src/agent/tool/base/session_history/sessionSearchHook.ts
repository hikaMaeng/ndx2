import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { recordSessionSearchFromSessionData } from "../../../session/sessionSearch.js";
import type { NDXSessionDataRow } from "../../../session/types.js";
import type { NDXHookCodeExecutor, NDXHookContext, NDXHookEffect } from "../../../hook/index.js";

export type NDXSessionSearchHookInsertionEvent = typeof NDX_TURN_EVENT.TurnEnd;

export function createSessionSearchHook(input: {
  name: string;
  select: (context: Readonly<NDXHookContext>) => NDXSessionDataRow | undefined;
}): NDXHookCodeExecutor {
  return {
    kind: "code",
    name: input.name,
    source: "system",
    async run(context): Promise<NDXHookEffect> {
      const row = input.select(context);
      if (!row) {
        return { type: "noeffect" };
      }
      await recordSessionSearchFromSessionData(context.database, row, context.userHome);
      return { type: "noeffect" };
    }
  };
}

export const turnEndInputSessionSearchHook = createSessionSearchHook({
  name: "system.turn.end.input_session_search",
  select: (context) => context.input
});

export const turnEndAssistantSessionSearchHook = createSessionSearchHook({
  name: "system.turn.end.assistant_session_search",
  select: (context) => context.assistant
});
