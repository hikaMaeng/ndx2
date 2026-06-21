import type { NDXDatabase, NDXSessionCreateInput, NDXSessionRow } from "./types.js";
import { withSessionProjectPath } from "./types.js";
import { uuid7 } from "../../common/uuid7/index.js";
import { normalizeWorkspaceProjectName } from "../../common/server-path/index.js";

export async function createSession(database: NDXDatabase, input: NDXSessionCreateInput): Promise<NDXSessionRow> {
  database.logger?.info("agent.server.session.create.start", {
    projectname: input.projectname,
    model: input.model.model
  });
  const projectname = normalizeWorkspaceProjectName(input.projectname);
  const sessionid = input.sessionid ?? uuid7();
  const parentsessionid = input.parentsessionid ?? sessionid;
  const rootsessionid = input.rootsessionid ?? (parentsessionid === sessionid ? sessionid : parentsessionid);
  const result = await database.query<NDXSessionRow>(
    `
INSERT INTO "session" (sessionid, title, mode, projectname, parentsessionid, rootsessionid, createdbytoolcallid, createdbytoolname, subagenttype, subagentconfig, subagentstatus, model)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb)
RETURNING sessionid, title, lastupdated, mode, projectname, parentsessionid, rootsessionid, createdbytoolcallid, createdbytoolname, subagenttype, subagentconfig, subagentstatus, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata;
`,
    [
      sessionid,
      input.title ?? "",
      input.mode ?? "none",
      projectname,
      parentsessionid,
      rootsessionid,
      input.createdbytoolcallid ?? null,
      input.createdbytoolname ?? null,
      input.subagenttype ?? null,
      JSON.stringify(input.subagentconfig ?? {}),
      input.subagenttype ? "created" : "none",
      JSON.stringify(input.model)
    ]
  );

  database.logger?.info("agent.server.session.create.complete", { sessionid: result.rows[0]?.sessionid });
  return withSessionProjectPath(result.rows[0]);
}
