import type { NDXDatabase } from "./types.js";

export const SESSIONTOKEN_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sessiontoken (
  token uuid PRIMARY KEY,
  createdat timestamptz NOT NULL DEFAULT now(),
  sessionid uuid NOT NULL REFERENCES "session" (sessionid) ON DELETE CASCADE
);
`;

export const SESSIONTOKEN_TABLE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS sessiontoken_sessionid_createdat_idx ON sessiontoken (sessionid, createdat DESC);
CREATE INDEX IF NOT EXISTS sessiontoken_createdat_idx ON sessiontoken (createdat);
`;

export async function initSessionTokenDatabase(database: NDXDatabase): Promise<void> {
  database.logger?.info("agent.server.session_token.schema.init.start");
  await database.query(SESSIONTOKEN_TABLE_SQL);
  await database.query(SESSIONTOKEN_TABLE_INDEX_SQL);
  database.logger?.info("agent.server.session_token.schema.init.complete");
}
