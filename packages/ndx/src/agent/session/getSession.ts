import type { NDXDatabase, NDXSessionRow } from "./types.js";
import { withSessionProjectPath } from "./types.js";

export async function getSession(database: NDXDatabase, sessionid: string): Promise<NDXSessionRow | undefined> {
  database.logger?.debug("agent.server.session.get.start", { sessionid });
  const result = await database.query<NDXSessionRow>(
    `
SELECT sessionid, userid, title, lastupdated, mode, projectname, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, slidewindow, runtimedata
FROM "session"
WHERE sessionid = $1;
`,
    [sessionid]
  );

  database.logger?.debug("agent.server.session.get.complete", { sessionid, found: Boolean(result.rows[0]) });
  return result.rows[0] ? withSessionProjectPath(result.rows[0]) : undefined;
}
