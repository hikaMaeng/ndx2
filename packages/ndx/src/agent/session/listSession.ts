import type { NDXDatabase, NDXSessionRow } from "./types.js";
import { withSessionProjectPath } from "./types.js";

export async function listSession(database: NDXDatabase, projectname: string): Promise<NDXSessionRow[]> {
  database.logger?.debug("agent.server.session.list.start", { projectname });
  const result = await database.query<NDXSessionRow>(
    `
SELECT sessionid, title, lastupdated, mode, projectname, parentsessionid, rootsessionid, createdbytoolcallid, createdbytoolname, subagenttype, subagentconfig, subagentstatus, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata
FROM "session"
WHERE projectname = $1
  AND parentsessionid IS NULL
ORDER BY lastupdated DESC, sessionid DESC;
`,
    [projectname]
  );

  database.logger?.debug("agent.server.session.list.complete", { projectname, count: result.rows.length });
  return result.rows.map(withSessionProjectPath);
}

export async function listChildSessions(database: NDXDatabase, parentSessionid: string): Promise<NDXSessionRow[]> {
  database.logger?.debug("agent.server.session.children.list.start", { parentSessionid });
  const result = await database.query<NDXSessionRow>(
    `
SELECT sessionid, title, lastupdated, mode, projectname, parentsessionid, rootsessionid, createdbytoolcallid, createdbytoolname, subagenttype, subagentconfig, subagentstatus, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata
FROM "session"
WHERE parentsessionid = $1
ORDER BY lastupdated DESC, sessionid DESC;
`,
    [parentSessionid]
  );

  database.logger?.debug("agent.server.session.children.list.complete", { parentSessionid, count: result.rows.length });
  return result.rows.map(withSessionProjectPath);
}
