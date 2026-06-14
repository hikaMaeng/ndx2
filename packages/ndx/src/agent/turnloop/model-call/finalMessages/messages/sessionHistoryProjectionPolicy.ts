import type { NDXFinalMessagePipelineContext } from "./types.js";
import type { NDXSessionDataRow } from "../../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export function sessionHistoryProjectionPolicy(context: NDXFinalMessagePipelineContext): NDXFinalMessagePipelineContext {
  const rows = context.rows.flatMap(expandCompactReplayRow);
  const toolCallIterations = new Set<number>();
  for (const row of rows) {
    if (row.contents && typeof row.contents === "object" && (row.contents as { kind?: unknown }).kind === "tool_call") {
      const iteration = (row.contents as { iteration?: unknown }).iteration;
      if (typeof iteration === "number") {
        toolCallIterations.add(iteration);
      }
    }
  }

  return {
    ...context,
    rows,
    rowStates: rows.map((row) => {
      let messages: ResponseInputItem[] = [];
      for (const policy of context.rowProjectionPolicies) {
        const projected = policy.project(row, { toolCallIterations });
        if (projected) {
          messages = projected;
          break;
        }
      }
      return { row, messages };
    })
  };
}

function expandCompactReplayRow(row: NDXSessionDataRow): NDXSessionDataRow[] {
  if (!row.contents || typeof row.contents !== "object" || (row.contents as { kind?: unknown }).kind !== "compact_replay") {
    return [row];
  }
  const rows = (row.contents as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const replay = item as { dataid?: unknown; type?: unknown; contents?: unknown; createdat?: unknown };
    if (typeof replay.type !== "string") {
      return [];
    }
    return [{
      dataid: typeof replay.dataid === "string" && replay.dataid.trim() ? replay.dataid : `${row.dataid}:replay:${index}`,
      sessionid: row.sessionid,
      type: replay.type,
      contents: replay.contents,
      createdat: typeof replay.createdat === "string" ? new Date(replay.createdat) : row.createdat
    }];
  });
}
