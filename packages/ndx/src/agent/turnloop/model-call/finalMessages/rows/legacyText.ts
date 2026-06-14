import { sessionDataText } from "../../../../session/content.js";
import type { NDXSessionDataRow } from "../../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export function legacyTextRowProjection(row: NDXSessionDataRow): ResponseInputItem[] | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    const text = sessionDataText(row);
    return row.type === "user" && text ? [{ role: "user", content: text }] : row.type === "assistant" && text ? [{ role: "assistant", content: text }] : [];
  }
  return undefined;
}
