import { sessionDataText } from "../../../../session/content.js";
import type { NDXSessionDataContents } from "../../../../../common/protocol/index.js";
import type { NDXSessionDataRow } from "../../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export function userMessageProjection(row: NDXSessionDataRow): ResponseInputItem[] | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const contents = row.contents as Partial<NDXSessionDataContents>;
  if (row.type === "user" || contents.kind === "tool_generated_user_message") {
    const content = sessionDataText({ type: "user", contents: row.contents });
    if (typeof content === "string" && !content.trim()) {
      return [];
    }
    return content === undefined ? [] : [{ role: "user", content }];
  }
  return undefined;
}
