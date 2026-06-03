import type { NDXDatabase } from "../init/index.js";

export const DEFAULT_NDX_USERID = "ndev";

export const USERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS users (
  userid text PRIMARY KEY,
  created timestamptz NOT NULL DEFAULT now()
);
`;

export const DEFAULT_USER_RECORD_SQL = `
INSERT INTO users (userid)
VALUES ($1)
ON CONFLICT (userid) DO NOTHING;
`;

export async function initAccountDatabase(database: NDXDatabase): Promise<void> {
  database.logger?.info("agent.server.account.schema.init.start");
  await database.query(USERS_TABLE_SQL);
  await database.query(DEFAULT_USER_RECORD_SQL, [DEFAULT_NDX_USERID]);
  database.logger?.info("agent.server.account.schema.init.complete", { defaultUserid: DEFAULT_NDX_USERID });
}
