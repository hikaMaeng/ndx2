import type { QueryResult, QueryResultRow } from "pg";
import type { NDXLogger } from "../../../common/log/index.js";

export type NDXDatabase = {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
  close(): Promise<void>;
  logger?: NDXLogger;
};
