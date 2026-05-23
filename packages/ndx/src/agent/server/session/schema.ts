import type { NDXDatabase } from "./types.js";

export const SESSION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "session" (
  sessionid uuid PRIMARY KEY,
  userid text NOT NULL,
  title text NOT NULL DEFAULT '',
  lastupdated timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL DEFAULT 'none' CHECK (mode IN ('none', 'light')),
  path text NOT NULL,
  projectid text NOT NULL,
  model jsonb NOT NULL CHECK (
    model->>'type' = 'openai'
    AND jsonb_typeof(model->'contextsize') = 'number'
    AND (model->>'contextsize')::integer > 0
  ),
  isrunning boolean NOT NULL DEFAULT false,
  turnphase text NOT NULL DEFAULT 'idle',
  interruptrequested boolean NOT NULL DEFAULT false,
  interruptrequestedat timestamptz,
  interruptcompletedat timestamptz
);
`;

export const SESSION_TABLE_MIGRATION_SQL = `
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS turnphase text NOT NULL DEFAULT 'idle';
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS interruptrequested boolean NOT NULL DEFAULT false;
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS interruptrequestedat timestamptz;
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS interruptcompletedat timestamptz;
`;

export const SESSION_TABLE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS session_userid_lastupdated_idx ON "session" (userid, lastupdated DESC);
CREATE INDEX IF NOT EXISTS session_projectid_lastupdated_idx ON "session" (projectid, lastupdated DESC);
`;

export const SESSIONDATA_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sessiondata (
  dataid bigserial PRIMARY KEY,
  sessionid uuid NOT NULL REFERENCES "session" (sessionid) ON DELETE CASCADE,
  type text NOT NULL,
  contents jsonb NOT NULL,
  createdat timestamptz NOT NULL DEFAULT now()
);
`;

export const SESSIONDATA_TABLE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS sessiondata_sessionid_dataid_idx ON sessiondata (sessionid, dataid);
`;

export async function initSessionDatabase(database: NDXDatabase): Promise<void> {
  database.logger?.info("agent.server.session.schema.init.start");
  await database.query(SESSION_TABLE_SQL);
  await database.query(SESSION_TABLE_MIGRATION_SQL);
  await database.query(SESSION_TABLE_INDEX_SQL);
  await database.query(SESSIONDATA_TABLE_SQL);
  await database.query(SESSIONDATA_TABLE_INDEX_SQL);
  database.logger?.info("agent.server.session.schema.init.complete");
}
