import type { NDXFinalMessagePipelineContext } from "./types.js";

export function finalizeSessionHistoryPolicy(context: NDXFinalMessagePipelineContext): NDXFinalMessagePipelineContext {
  return {
    ...context,
    historyMessages: context.rowStates.flatMap((state) => state.messages)
  };
}
