import type { NDXDatabase } from "./types.js";

export const CHATFOLDER_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS chatfolder (
  folderid uuid PRIMARY KEY,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'normal' CHECK (kind IN ('root', 'normal')),
  screenorder integer NOT NULL DEFAULT 0 CHECK (screenorder >= 0),
  createdat timestamptz NOT NULL DEFAULT now(),
  updatedat timestamptz NOT NULL DEFAULT now()
);
`;

export const CHATFOLDER_TABLE_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS chatfolder_root_uidx ON chatfolder (kind) WHERE kind = 'root';
CREATE INDEX IF NOT EXISTS chatfolder_screenorder_idx ON chatfolder (screenorder ASC, createdat ASC);
`;

export const CHATSESSION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS chatsession (
  chatsessionid uuid PRIMARY KEY,
  folderid uuid NOT NULL REFERENCES chatfolder (folderid) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  model jsonb NOT NULL CHECK (
    model->>'type' = 'openai'
    AND jsonb_typeof(model->'contextsize') = 'number'
    AND (model->>'contextsize')::integer > 0
  ),
  isrunning boolean NOT NULL DEFAULT false,
  turnphase text NOT NULL DEFAULT 'idle',
  interruptrequested boolean NOT NULL DEFAULT false,
  interruptrequestedat timestamptz,
  interruptcompletedat timestamptz,
  runtimedata jsonb NOT NULL DEFAULT '{}'::jsonb,
  createdat timestamptz NOT NULL DEFAULT now(),
  lastupdated timestamptz NOT NULL DEFAULT now()
);
`;

export const CHATSESSION_TABLE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS chatsession_folderid_lastupdated_idx ON chatsession (folderid, lastupdated DESC);
`;

export const CHATSESSIONDATA_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS chatsessiondata (
  dataid bigserial PRIMARY KEY,
  chatsessionid uuid NOT NULL REFERENCES chatsession (chatsessionid) ON DELETE CASCADE,
  type text NOT NULL,
  contents jsonb NOT NULL,
  createdat timestamptz NOT NULL DEFAULT now()
);
`;

export const CHATSESSIONDATA_TABLE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS chatsessiondata_chatsessionid_dataid_idx ON chatsessiondata (chatsessionid, dataid);
`;

export const CHAT_TABLE_MIGRATION_SQL = `
DO $$
DECLARE
  canonical_root uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chatfolder'
      AND column_name = 'userid'
  ) THEN
    SELECT folderid
    INTO canonical_root
    FROM chatfolder
    WHERE kind = 'root'
    ORDER BY createdat ASC, folderid ASC
    LIMIT 1;

    IF canonical_root IS NOT NULL THEN
      UPDATE chatsession
      SET folderid = canonical_root
      WHERE folderid IN (
        SELECT folderid
        FROM chatfolder
        WHERE kind = 'root'
          AND folderid <> canonical_root
      );

      DELETE FROM chatfolder
      WHERE kind = 'root'
        AND folderid <> canonical_root;
    END IF;
  END IF;
END $$;

DROP INDEX IF EXISTS chatfolder_userid_root_uidx;
DROP INDEX IF EXISTS chatfolder_userid_screenorder_idx;
DROP INDEX IF EXISTS chatsession_userid_lastupdated_idx;
ALTER TABLE chatsession DROP COLUMN IF EXISTS userid CASCADE;
ALTER TABLE chatfolder DROP COLUMN IF EXISTS userid CASCADE;
`;

export async function initChatDatabase(database: NDXDatabase): Promise<void> {
  database.logger?.info("agent.server.chat.schema.init.start");
  await database.query(CHATFOLDER_TABLE_SQL);
  await database.query(CHATSESSION_TABLE_SQL);
  await database.query(CHAT_TABLE_MIGRATION_SQL);
  await database.query(CHATFOLDER_TABLE_INDEX_SQL);
  await database.query(CHATSESSION_TABLE_INDEX_SQL);
  await database.query(CHATSESSIONDATA_TABLE_SQL);
  await database.query(CHATSESSIONDATA_TABLE_INDEX_SQL);
  database.logger?.info("agent.server.chat.schema.init.complete");
}
