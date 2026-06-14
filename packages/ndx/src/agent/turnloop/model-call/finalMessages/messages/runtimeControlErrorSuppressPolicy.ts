import { isRuntimeControlErrorMessage, suppressRows } from "./utils.js";
import type { NDXFinalMessagePipelineContext } from "./types.js";

export function runtimeControlErrorSuppressPolicy(context: NDXFinalMessagePipelineContext): NDXFinalMessagePipelineContext {
  return suppressRows(context, "runtime-control error suppress", (state) => {
    const contents = state.row.contents;
    return Boolean(
      contents &&
      typeof contents === "object" &&
      (contents as { kind?: unknown }).kind === "error" &&
      typeof (contents as { message?: unknown }).message === "string" &&
      isRuntimeControlErrorMessage((contents as { message: string }).message)
    );
  });
}
