import type { NDXDatabase, NDXSessionRow } from "./types.js";
import { withSessionProjectPath } from "./types.js";

export async function listSession(database: NDXDatabase, userid: string, projectname: string): Promise<NDXSessionRow[]> {
  database.logger?.debug("agent.server.session.list.start", { userid, projectname });
  const result = await database.query<NDXSessionRow>(
    `
SELECT sessionid, userid, title, lastupdated, mode, projectname, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata
FROM "session"
WHERE userid = $1
  AND projectname = $2
ORDER BY lastupdated DESC, sessionid DESC;
`,
    [userid, projectname]
  );

  database.logger?.debug("agent.server.session.list.complete", { userid, projectname, count: result.rows.length });
  return result.rows.map(withSessionProjectPath);
}
