import { sessionDataText } from "../../../../session/content.js";
import { NDX_COT_WORK_CONTENT_KIND } from "../../../../../common/protocol/index.js";
import type { NDXSessionDataContents } from "../../../../../common/protocol/index.js";
import type { NDXSessionDataRow } from "../../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export function cotWorkReminderProjection(row: NDXSessionDataRow): ResponseInputItem[] | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const contents = row.contents as Partial<NDXSessionDataContents>;
  if (contents.kind === "cot_work_reminder") {
    const content = sessionDataText(row);
    return typeof content === "string" && content.trim().length > 0 ? [{ role: "user", content }] : [];
  }
  return undefined;
}

export function cotWorkPayloadHideProjection(row: NDXSessionDataRow): ResponseInputItem[] | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const contents = row.contents as Partial<NDXSessionDataContents>;
  if (contents.kind === NDX_COT_WORK_CONTENT_KIND) {
    return [];
  }
  return undefined;
}
