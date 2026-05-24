import type { NDXDatabase, NDXSessionRow } from "./types.js";

export async function listSession(database: NDXDatabase, userid: string, projectid: string): Promise<NDXSessionRow[]> {
  database.logger?.debug("agent.server.session.list.start", { userid, projectid });
  const result = await database.query<NDXSessionRow>(
    `
SELECT sessionid, userid, title, lastupdated, mode, path, projectid, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata
FROM "session"
WHERE userid = $1
  AND projectid = $2
ORDER BY lastupdated DESC, sessionid DESC;
`,
    [userid, projectid]
  );

  database.logger?.debug("agent.server.session.list.complete", { userid, projectid, count: result.rows.length });
  return result.rows;
}
