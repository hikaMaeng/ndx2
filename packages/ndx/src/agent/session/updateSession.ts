import type { NDXDatabase, NDXModelConfig, NDXSessionRow } from "./types.js";
import { withSessionProjectPath } from "./types.js";

export async function updateSessionStartTurn(database: NDXDatabase, sessionid: string, model?: NDXModelConfig): Promise<NDXSessionRow> {
  database.logger?.info("agent.server.session.turn.start", { sessionid, model: model?.model });
  const result = await database.query<NDXSessionRow>(
    `
UPDATE "session"
SET
  model = COALESCE($2::jsonb, model),
  isrunning = true,
  turnphase = 'starting',
  interruptrequested = false,
  interruptrequestedat = NULL,
  interruptcompletedat = NULL
WHERE sessionid = $1
RETURNING sessionid, userid, title, lastupdated, mode, projectname, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata;
`,
    [sessionid, model ? JSON.stringify(model) : null]
  );

  if (!result.rows[0]) {
    database.logger?.warn("agent.server.session.turn.start_missing", { sessionid });
    throw new Error(`Session not found: ${sessionid}`);
  }

  database.logger?.info("agent.server.session.turn.start_complete", { sessionid });
  return withSessionProjectPath(result.rows[0]);
}

export async function updateSessionEndTurn(database: NDXDatabase, sessionid: string): Promise<NDXSessionRow> {
  database.logger?.info("agent.server.session.turn.end", { sessionid });
  const result = await database.query<NDXSessionRow>(
    `
UPDATE "session"
SET
  isrunning = false,
  turnphase = 'idle',
  lastupdated = now()
WHERE sessionid = $1
RETURNING sessionid, userid, title, lastupdated, mode, projectname, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata;
`,
    [sessionid]
  );

  if (!result.rows[0]) {
    database.logger?.warn("agent.server.session.turn.end_missing", { sessionid });
    throw new Error(`Session not found: ${sessionid}`);
  }

  database.logger?.info("agent.server.session.turn.end_complete", { sessionid });
  return withSessionProjectPath(result.rows[0]);
}

export async function updateSessionTitle(database: NDXDatabase, sessionid: string, title: string): Promise<NDXSessionRow> {
  database.logger?.info("agent.server.session.title.update", { sessionid, titleLength: title.length });
  const result = await database.query<NDXSessionRow>(
    `
UPDATE "session"
SET
  title = $2,
  lastupdated = now()
WHERE sessionid = $1
RETURNING sessionid, userid, title, lastupdated, mode, projectname, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata;
`,
    [sessionid, title]
  );

  if (!result.rows[0]) {
    database.logger?.warn("agent.server.session.title.update_missing", { sessionid });
    throw new Error(`Session not found: ${sessionid}`);
  }

  database.logger?.info("agent.server.session.title.update_complete", { sessionid });
  return withSessionProjectPath(result.rows[0]);
}
