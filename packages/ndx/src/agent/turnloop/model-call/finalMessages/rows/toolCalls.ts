import type { NDXSessionDataContents } from "../../../../../common/protocol/index.js";
import type { NDXSessionDataRow } from "../../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export function toolCallProjection(row: NDXSessionDataRow): ResponseInputItem[] | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const contents = row.contents as Partial<NDXSessionDataContents>;
  if (contents.kind === "tool_call" && Array.isArray(contents.toolCalls)) {
    return contents.toolCalls.filter((toolCall): toolCall is ResponseInputItem => Boolean(toolCall && typeof toolCall === "object" && !Array.isArray(toolCall)));
  }
  return undefined;
}

export function toolResultProjection(row: NDXSessionDataRow): ResponseInputItem[] | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const contents = row.contents as Partial<NDXSessionDataContents>;
  if (contents.kind === "tool_result" && Array.isArray(contents.results)) {
    return contents.results.map((result) => ({
      type: "function_call_output",
      call_id: result.toolCallId || "tool_call",
      output: stringifyToolOutput(result.output)
    }));
  }
  return undefined;
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === null || typeof output === "undefined") return "tool result unavailable";
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}
