import { sessionDataText } from "../../../../session/content.js";
import type { NDXSessionDataContents } from "../../../../../common/protocol/index.js";
import type { NDXSessionDataRow } from "../../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";
import type { NDXFinalRowProjectionContext } from "./types.js";

export function assistantToolDeltaHideProjection(row: NDXSessionDataRow, context: NDXFinalRowProjectionContext): ResponseInputItem[] | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const contents = row.contents as Partial<NDXSessionDataContents>;
  if (contents.kind === "assistant_delta" && typeof contents.iteration === "number" && context.toolCallIterations.has(contents.iteration)) {
    return [];
  }
  return undefined;
}

export function assistantReasoningHideProjection(row: NDXSessionDataRow): ResponseInputItem[] | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const contents = row.contents as Partial<NDXSessionDataContents>;
  if (contents.kind === "assistant_reasoning") {
    return [];
  }
  return undefined;
}

export function assistantMessageProjection(row: NDXSessionDataRow): ResponseInputItem[] | undefined {
  if (row.type === "assistant") {
    const content = sessionDataText(row);
    return typeof content === "string" && content.trim().length > 0 ? [{ role: "assistant", content }] : [];
  }
  return undefined;
}
