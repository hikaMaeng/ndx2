import type { NDXDatabase } from "../init/database.js";

export const SELFCHECK_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS selfcheck (
  selfcheckid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subjectkind text NOT NULL CHECK (subjectkind IN ('tool', 'hook')),
  subjectname text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'accepted', 'dismissed', 'resolved')),
  fingerprint text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric,
  model jsonb,
  promptversion text NOT NULL,
  analysiskind text NOT NULL DEFAULT 'llm',
  llmraw jsonb,
  targetsessionid uuid REFERENCES "session" (sessionid) ON DELETE SET NULL,
  targetdataid bigint REFERENCES sessiondata (dataid) ON DELETE SET NULL,
  targetiteration integer,
  targetcallid text,
  targethookrunid uuid,
  firstseenat timestamptz NOT NULL DEFAULT now(),
  lastseenat timestamptz NOT NULL DEFAULT now(),
  occurrencecount integer NOT NULL DEFAULT 1,
  sampledataids bigint[] NOT NULL DEFAULT ARRAY[]::bigint[],
  createdat timestamptz NOT NULL DEFAULT now(),
  updatedat timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysiskind, subjectkind, subjectname, fingerprint)
);
`;

export const SELFCHECK_CANDIDATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS selfcheck_analysis_candidate (
  candidateid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subjectkind text NOT NULL CHECK (subjectkind IN ('tool', 'hook')),
  subjectname text NOT NULL,
  analyzer text NOT NULL,
  sessionid uuid REFERENCES "session" (sessionid) ON DELETE SET NULL,
  calldataid bigint REFERENCES sessiondata (dataid) ON DELETE SET NULL,
  resultdataid bigint REFERENCES sessiondata (dataid) ON DELETE SET NULL,
  hookrunid uuid,
  fingerprint text NOT NULL,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'analyzed', 'skipped', 'failed')),
  attemptcount integer NOT NULL DEFAULT 0,
  lastattemptat timestamptz,
  lasterror text,
  createdat timestamptz NOT NULL DEFAULT now(),
  updatedat timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analyzer, subjectkind, subjectname, fingerprint)
);
`;

export const SELFCHECK_CURSOR_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS selfcheck_analysis_cursor (
  analyzer text PRIMARY KEY,
  subjectkind text NOT NULL CHECK (subjectkind IN ('tool', 'hook')),
  subjectname text NOT NULL,
  lastdataid bigint NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  laststartedat timestamptz,
  lastcompletedat timestamptz,
  laststatus text,
  lasterror text,
  updatedat timestamptz NOT NULL DEFAULT now()
);
`;

export const SELFCHECK_RUN_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS selfcheck_analysis_run (
  runid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analyzer text NOT NULL,
  subjectkind text NOT NULL CHECK (subjectkind IN ('tool', 'hook')),
  subjectname text NOT NULL,
  startedat timestamptz NOT NULL DEFAULT now(),
  completedat timestamptz,
  fromdataid bigint NOT NULL DEFAULT 0,
  todataid bigint,
  scannedrows integer NOT NULL DEFAULT 0,
  createdcandidates integer NOT NULL DEFAULT 0,
  llmanalyses integer NOT NULL DEFAULT 0,
  createdchecks integer NOT NULL DEFAULT 0,
  dedupedchecks integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  error text
);
`;

export const SELFCHECK_HOOKRUN_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS selfcheck_hookrun (
  hookrunserial bigserial PRIMARY KEY,
  hookrunid uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  sessionid uuid REFERENCES "session" (sessionid) ON DELETE SET NULL,
  eventname text NOT NULL,
  hookname text,
  startedat timestamptz NOT NULL DEFAULT now(),
  completedat timestamptz,
  status text NOT NULL DEFAULT 'completed',
  effectsummary jsonb NOT NULL DEFAULT '{}'::jsonb,
  stoppedturn boolean NOT NULL DEFAULT false,
  interruptedresponse boolean NOT NULL DEFAULT false,
  replacedrequest boolean NOT NULL DEFAULT false,
  replacedtoolcalls boolean NOT NULL DEFAULT false,
  replacedtoolresults boolean NOT NULL DEFAULT false,
  finalassistanttext text,
  error text,
  relateddataids bigint[] NOT NULL DEFAULT ARRAY[]::bigint[]
);
`;

export const SELFCHECK_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS selfcheck_status_updatedat_idx ON selfcheck (status, updatedat DESC);
CREATE INDEX IF NOT EXISTS selfcheck_subject_updatedat_idx ON selfcheck (subjectkind, subjectname, updatedat DESC);
CREATE INDEX IF NOT EXISTS selfcheck_candidate_status_createdat_idx ON selfcheck_analysis_candidate (status, createdat);
CREATE INDEX IF NOT EXISTS selfcheck_run_startedat_idx ON selfcheck_analysis_run (startedat DESC);
CREATE INDEX IF NOT EXISTS selfcheck_hookrun_event_serial_idx ON selfcheck_hookrun (eventname, hookrunserial);
`;

export async function initSelfcheckDatabase(database: NDXDatabase): Promise<void> {
  database.logger?.info("agent.server.selfcheck.schema.init.start");
  await database.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await database.query(SELFCHECK_TABLE_SQL);
  await database.query(SELFCHECK_CANDIDATE_TABLE_SQL);
  await database.query(SELFCHECK_CURSOR_TABLE_SQL);
  await database.query(SELFCHECK_RUN_TABLE_SQL);
  await database.query(SELFCHECK_HOOKRUN_TABLE_SQL);
  await database.query(SELFCHECK_INDEX_SQL);
  database.logger?.info("agent.server.selfcheck.schema.init.complete");
}
