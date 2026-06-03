import type { NDXDatabase, NDXSessionRow } from "./types.js";
import { withSessionProjectPath } from "./types.js";

export async function updateSessionTurnPhase(database: NDXDatabase, sessionid: string, phase: string): Promise<NDXSessionRow> {
  const result = await database.query<NDXSessionRow>(
    `
UPDATE "session"
SET turnphase = $2
WHERE sessionid = $1
RETURNING sessionid, userid, title, lastupdated, mode, projectname, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata;
`,
    [sessionid, phase]
  );

  if (!result.rows[0]) {
    throw new Error(`Session not found: ${sessionid}`);
  }

  return withSessionProjectPath(result.rows[0]);
}

export async function requestSessionInterrupt(database: NDXDatabase, sessionid: string, phase?: string): Promise<NDXSessionRow> {
  database.logger?.info("agent.server.session.interrupt.request", { sessionid, phase });
  const result = await database.query<NDXSessionRow>(
    `
UPDATE "session"
SET
  interruptrequested = true,
  interruptrequestedat = COALESCE(interruptrequestedat, now()),
  interruptcompletedat = NULL,
  turnphase = COALESCE($2, turnphase)
WHERE sessionid = $1
RETURNING sessionid, userid, title, lastupdated, mode, projectname, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata;
`,
    [sessionid, phase ?? null]
  );

  if (!result.rows[0]) {
    database.logger?.warn("agent.server.session.interrupt.request_missing", { sessionid });
    throw new Error(`Session not found: ${sessionid}`);
  }

  return withSessionProjectPath(result.rows[0]);
}

export async function completeSessionInterrupt(database: NDXDatabase, sessionid: string): Promise<NDXSessionRow> {
  database.logger?.info("agent.server.session.interrupt.complete", { sessionid });
  const result = await database.query<NDXSessionRow>(
    `
UPDATE "session"
SET
  isrunning = false,
  turnphase = 'idle',
  interruptrequested = false,
  interruptcompletedat = now(),
  lastupdated = now()
WHERE sessionid = $1
RETURNING sessionid, userid, title, lastupdated, mode, projectname, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata;
`,
    [sessionid]
  );

  if (!result.rows[0]) {
    database.logger?.warn("agent.server.session.interrupt.complete_missing", { sessionid });
    throw new Error(`Session not found: ${sessionid}`);
  }

  return withSessionProjectPath(result.rows[0]);
}
