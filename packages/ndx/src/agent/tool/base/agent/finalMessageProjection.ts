import type { NDXSessionDataContents } from "../../../../common/protocol/index.js";
import type { NDXSessionDataRow } from "../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export function parentContextProjection(row: NDXSessionDataRow): ResponseInputItem[] | undefined {
  if (!row.contents || typeof row.contents !== "object") return undefined;
  const contents = row.contents as Partial<NDXSessionDataContents>;
  if (contents.kind !== "parent_context" || typeof contents.text !== "string" || !contents.text.trim()) return undefined;
  return [{
    role: "user",
    content: [
      "Parent session context summary:",
      contents.text.trim(),
      "",
      `If exact original parent rows are required, use session_history with mode="recall", scope="session", sessionid="${contents.parentSessionid}".`
    ].join("\n")
  }];
}

export function subagentSessionHideProjection(row: NDXSessionDataRow): ResponseInputItem[] | undefined {
  if (!row.contents || typeof row.contents !== "object") return undefined;
  return (row.contents as Partial<NDXSessionDataContents>).kind === "subagent_session" ? [] : undefined;
}
