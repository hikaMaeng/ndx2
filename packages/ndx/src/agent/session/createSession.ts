import type { NDXDatabase, NDXSessionCreateInput, NDXSessionRow } from "./types.js";
import { withSessionProjectPath } from "./types.js";
import { uuid7 } from "../../common/uuid7/index.js";
import { normalizeWorkspaceProjectName } from "../../common/server-path/index.js";

export async function createSession(database: NDXDatabase, input: NDXSessionCreateInput): Promise<NDXSessionRow> {
  database.logger?.info("agent.server.session.create.start", {
    userid: input.userid,
    projectname: input.projectname,
    model: input.model.model
  });
  const projectname = normalizeWorkspaceProjectName(input.projectname);
  const result = await database.query<NDXSessionRow>(
    `
INSERT INTO "session" (sessionid, userid, title, mode, projectname, model)
VALUES ($1, $2, $3, $4, $5, $6::jsonb)
RETURNING sessionid, userid, title, lastupdated, mode, projectname, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, slidewindow, runtimedata;
`,
    [
      input.sessionid ?? uuid7(),
      input.userid,
      input.title ?? "",
      input.mode ?? "none",
      projectname,
      JSON.stringify(input.model)
    ]
  );

  database.logger?.info("agent.server.session.create.complete", { sessionid: result.rows[0]?.sessionid });
  return withSessionProjectPath(result.rows[0]);
}
