import { invalidToolArgumentCallIdsBeforeLatestUser, latestUserMessageDataId, messageCallId } from "./utils.js";
import type { NDXFinalMessagePipelineContext } from "./types.js";

export function invalidToolFailurePairSuppressPolicy(context: NDXFinalMessagePipelineContext): NDXFinalMessagePipelineContext {
  const latestUserDataId = latestUserMessageDataId(context.rows);
  const suppressedToolCallIds = invalidToolArgumentCallIdsBeforeLatestUser(context.rows, latestUserDataId);
  if (!suppressedToolCallIds.size) {
    return context;
  }
  return {
    ...context,
    diagnostics: [...context.diagnostics, `invalid tool failure pair suppress: ${suppressedToolCallIds.size} call(s)`],
    rowStates: context.rowStates.map((state) => {
      const messages = state.messages.filter((message) => !suppressedToolCallIds.has(messageCallId(message)));
      return messages.length === state.messages.length
        ? state
        : { ...state, messages, suppressedBy: [...(state.suppressedBy ?? []), "invalid tool failure pair suppress"] };
    })
  };
}
