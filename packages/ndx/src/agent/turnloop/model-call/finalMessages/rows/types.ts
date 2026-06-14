import type { NDXSessionDataRow } from "../../../../session/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export type NDXFinalRowProjectionContext = {
  toolCallIterations: Set<number>;
};

export type NDXFinalRowProjectionPolicy = {
  name: string;
  project: (row: NDXSessionDataRow, context: NDXFinalRowProjectionContext) => ResponseInputItem[] | undefined;
};
