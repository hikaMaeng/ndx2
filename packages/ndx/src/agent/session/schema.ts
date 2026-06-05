import type { NDXDatabase } from "./types.js";

export const SESSION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "session" (
  sessionid uuid PRIMARY KEY,
  userid text NOT NULL,
  title text NOT NULL DEFAULT '',
	  lastupdated timestamptz NOT NULL DEFAULT now(),
	  mode text NOT NULL DEFAULT 'none' CHECK (mode IN ('none', 'light')),
	  projectname text NOT NULL,
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
  runtimedata jsonb NOT NULL DEFAULT '{}'::jsonb
);
`;

export const SESSION_TABLE_MIGRATION_SQL = `
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS turnphase text NOT NULL DEFAULT 'idle';
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS interruptrequested boolean NOT NULL DEFAULT false;
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS interruptrequestedat timestamptz;
	ALTER TABLE "session" ADD COLUMN IF NOT EXISTS interruptcompletedat timestamptz;
	ALTER TABLE "session" ADD COLUMN IF NOT EXISTS runtimedata jsonb NOT NULL DEFAULT '{}'::jsonb;
	ALTER TABLE "session" ADD COLUMN IF NOT EXISTS projectname text;
	DO $$
	BEGIN
	  IF EXISTS (
	    SELECT 1
	    FROM information_schema.columns
	    WHERE table_schema = 'public'
	      AND table_name = 'session'
	      AND column_name = 'path'
	  ) THEN
	    EXECUTE $migrate$
	      UPDATE "session"
	      SET projectname = split_part(regexp_replace(replace(path, chr(92), '/'), '^.*/workspace/', ''), '/', 1)
	      WHERE (projectname IS NULL OR btrim(projectname) = '')
	        AND path IS NOT NULL
	        AND btrim(path) <> ''
	    $migrate$;
	  END IF;

	  IF EXISTS (
	    SELECT 1
	    FROM information_schema.columns
	    WHERE table_schema = 'public'
	      AND table_name = 'session'
	      AND column_name = 'projectid'
	  ) THEN
	    EXECUTE $migrate$
	      UPDATE "session"
	      SET projectname = projectid
	      WHERE (projectname IS NULL OR btrim(projectname) = '')
	        AND projectid IS NOT NULL
	        AND btrim(projectid) <> ''
	    $migrate$;
	  END IF;
	END $$;
	UPDATE "session" SET projectname = 'default' WHERE projectname IS NULL OR btrim(projectname) = '';
	ALTER TABLE "session" ALTER COLUMN projectname SET NOT NULL;
	DO $$
	BEGIN
	  IF NOT EXISTS (
	    SELECT 1
	    FROM pg_constraint
	    WHERE conname = 'session_projectname_check'
	      AND conrelid = '"session"'::regclass
	  ) THEN
	    ALTER TABLE "session" ADD CONSTRAINT session_projectname_check CHECK (
	      btrim(projectname) <> ''
	      AND position('/' in projectname) = 0
	      AND position('\\' in projectname) = 0
	      AND projectname <> '.'
	      AND projectname <> '..'
	    );
	  END IF;
	END $$;
	DROP INDEX IF EXISTS session_projectid_lastupdated_idx;
	DROP TABLE IF EXISTS sessiontoken;
	ALTER TABLE "session" DROP CONSTRAINT IF EXISTS session_slidewindow_range_check;
	ALTER TABLE "session" DROP COLUMN IF EXISTS slidewindow;
	ALTER TABLE "session" DROP COLUMN IF EXISTS path;
	ALTER TABLE "session" DROP COLUMN IF EXISTS projectid;
	`;
	
	export const SESSION_TABLE_INDEX_SQL = `
	CREATE INDEX IF NOT EXISTS session_userid_lastupdated_idx ON "session" (userid, lastupdated DESC);
	CREATE INDEX IF NOT EXISTS session_projectname_lastupdated_idx ON "session" (projectname, lastupdated DESC);
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

export const SESSIONSEARCH_TABLE_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS textsearch_ko;
EXCEPTION WHEN undefined_file THEN
  NULL;
END $$;

CREATE OR REPLACE FUNCTION ndx_sessionsearch_regconfig()
RETURNS regconfig
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'korean') THEN
    RETURN 'korean'::regconfig;
  END IF;
  RETURN 'simple'::regconfig;
END;
$$;

CREATE OR REPLACE FUNCTION ndx_tsvector_token_count(doc tsvector)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  entry text;
  positions text;
  total integer := 0;
BEGIN
  IF doc IS NULL OR length(doc::text) = 0 THEN
    RETURN 0;
  END IF;

  FOREACH entry IN ARRAY regexp_split_to_array(doc::text, E'\\s+') LOOP
    positions := substring(entry from ':(.+)$');
    IF positions IS NULL OR positions = '' THEN
      total := total + 1;
    ELSE
      total := total + COALESCE(array_length(regexp_split_to_array(positions, ','), 1), 0);
    END IF;
  END LOOP;
  RETURN total;
END;
$$;

CREATE TABLE IF NOT EXISTS sessionsearch (
  dataid bigint PRIMARY KEY REFERENCES sessiondata (dataid) ON DELETE CASCADE,
  sessionid uuid NOT NULL REFERENCES "session" (sessionid) ON DELETE CASCADE,
  type text NOT NULL,
  createdat timestamptz NOT NULL,
  "text" text NOT NULL,
  fts tsvector NOT NULL DEFAULT ''::tsvector,
  embedding vector(4096) NOT NULL DEFAULT (array_fill(0::real, ARRAY[4096])::vector(4096)),
  hnsw vector(256) NOT NULL DEFAULT (array_fill(0::real, ARRAY[256])::vector(256)),
  tokenlength integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION ndx_sessionsearch_sync_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fts := to_tsvector(ndx_sessionsearch_regconfig(), NEW."text");
  NEW.tokenlength := ndx_tsvector_token_count(NEW.fts);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessionsearch_sync_fields ON sessionsearch;
CREATE TRIGGER sessionsearch_sync_fields
BEFORE INSERT OR UPDATE OF "text"
ON sessionsearch
FOR EACH ROW
EXECUTE FUNCTION ndx_sessionsearch_sync_fields();
`;

export const SESSIONSEARCH_TABLE_MIGRATION_SQL = `
ALTER TABLE sessionsearch ADD COLUMN IF NOT EXISTS hnsw vector(256) NOT NULL DEFAULT (array_fill(0::real, ARRAY[256])::vector(256));
`;

export const SESSIONSEARCH_TABLE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS sessionsearch_sessionid_dataid_idx ON sessionsearch (sessionid, dataid);
CREATE INDEX IF NOT EXISTS sessionsearch_createdat_idx ON sessionsearch (createdat DESC, dataid DESC);
CREATE INDEX IF NOT EXISTS sessionsearch_fts_idx ON sessionsearch USING gin (fts);
DROP INDEX IF EXISTS sessionsearch_embedding_hnsw_idx;
CREATE INDEX IF NOT EXISTS sessionsearch_hnsw_idx ON sessionsearch USING hnsw (hnsw vector_cosine_ops);
`;

export async function initSessionDatabase(database: NDXDatabase): Promise<void> {
  database.logger?.info("agent.server.session.schema.init.start");
  await database.query(SESSION_TABLE_SQL);
  await database.query(SESSION_TABLE_MIGRATION_SQL);
  await database.query(SESSION_TABLE_INDEX_SQL);
  await database.query(SESSIONDATA_TABLE_SQL);
  await database.query(SESSIONDATA_TABLE_INDEX_SQL);
  await database.query(SESSIONSEARCH_TABLE_SQL);
  await database.query(SESSIONSEARCH_TABLE_MIGRATION_SQL);
  await database.query(SESSIONSEARCH_TABLE_INDEX_SQL);
  database.logger?.info("agent.server.session.schema.init.complete");
}
