import { sessionDataText } from "../../../../session/content.js";
import type { NDXSessionDataContents } from "../../../../../common/protocol/index.js";
import type { NDXSessionDataRow } from "../../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

const NDX_COMPACT_CONTENT_KIND = "compact";

export function compactSummaryProjection(row: NDXSessionDataRow): ResponseInputItem[] | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const contents = row.contents as Partial<NDXSessionDataContents>;
  if (contents.kind === NDX_COMPACT_CONTENT_KIND) {
    const content = sessionDataText(row);
    return typeof content === "string" && content.trim().length > 0 ? [{ role: "user", content: `Session compact summary:\n${content}` }] : [];
  }
  return undefined;
}
