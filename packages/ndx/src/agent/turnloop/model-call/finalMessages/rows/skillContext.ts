import type { NDXSessionDataContents } from "../../../../../common/protocol/index.js";
import type { NDXSessionDataRow } from "../../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export function skillContextProjection(row: NDXSessionDataRow): ResponseInputItem[] | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const contents = row.contents as Partial<NDXSessionDataContents>;
  if (contents.kind === "skill_context" && typeof contents.text === "string" && contents.text.trim().length > 0) {
    return [{ role: "user", content: contents.text }];
  }
  return undefined;
}
