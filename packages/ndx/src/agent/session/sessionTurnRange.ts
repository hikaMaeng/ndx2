import { sessionDataRowsForModelContext } from "../compact/index.js";
import type { NDXSessionDataRow } from "./types.js";

export type NDXSessionTurnRange = {
  input: NDXSessionDataRow;
  rows: NDXSessionDataRow[];
};

export function sessionTurnRangeForInput(rows: NDXSessionDataRow[], inputDataId: string): NDXSessionTurnRange | undefined {
  const startIndex = rows.findIndex((row) => row.type === "user" && String(row.dataid) === inputDataId);
  if (startIndex < 0) {
    return undefined;
  }
  const nextUserIndex = rows.findIndex((row, index) => index > startIndex && row.type === "user");
  return {
    input: rows[startIndex],
    rows: rows.slice(startIndex, nextUserIndex >= 0 ? nextUserIndex : undefined)
  };
}

export function sessionRowsThroughTurn(rows: NDXSessionDataRow[], inputDataId: string): NDXSessionDataRow[] | undefined {
  const range = sessionTurnRangeForInput(rows, inputDataId);
  if (!range) {
    return undefined;
  }
  const last = range.rows.at(-1);
  if (!last) {
    return undefined;
  }
  return rows.filter((row) => Number(row.dataid) <= Number(last.dataid));
}

export function compactSourceForRows(rows: NDXSessionDataRow[]): { previousCompact?: NDXSessionDataRow; sourceRows: NDXSessionDataRow[] } {
  const contextRows = sessionDataRowsForModelContext(rows);
  const first = contextRows[0];
  const previousCompact = isCompactRow(first) ? first : undefined;
  return {
    previousCompact,
    sourceRows: previousCompact ? contextRows.slice(1) : contextRows
  };
}

function isCompactRow(row: NDXSessionDataRow | undefined): row is NDXSessionDataRow {
  if (!row) return false;
  if (row.type === "compact") return true;
  return Boolean(row.contents && typeof row.contents === "object" && (row.contents as { kind?: unknown }).kind === "compact");
}
