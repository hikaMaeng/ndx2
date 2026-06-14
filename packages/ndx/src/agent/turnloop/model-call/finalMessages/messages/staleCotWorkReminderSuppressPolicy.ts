import { isBeforeDataId, latestUserMessageDataId, suppressRows } from "./utils.js";
import type { NDXFinalMessagePipelineContext } from "./types.js";

export function staleCotWorkReminderSuppressPolicy(context: NDXFinalMessagePipelineContext): NDXFinalMessagePipelineContext {
  const latestUserDataId = latestUserMessageDataId(context.rows);
  return suppressRows(context, "stale cot_work_reminder suppress", (state) => {
    const contents = state.row.contents;
    return Boolean(
      latestUserDataId &&
      contents &&
      typeof contents === "object" &&
      (contents as { kind?: unknown }).kind === "cot_work_reminder" &&
      isBeforeDataId(state.row.dataid, latestUserDataId)
    );
  });
}
