import type { NDXDatabase, NDXSessionCreateInput, NDXSessionRow } from "./types.js";
import { uuid7 } from "../../../common/uuid7/index.js";

export async function createSession(database: NDXDatabase, input: NDXSessionCreateInput): Promise<NDXSessionRow> {
  database.logger?.info("agent.server.session.create.start", {
    userid: input.userid,
    projectid: input.projectid,
    path: input.path,
    model: input.model.model
  });
  const result = await database.query<NDXSessionRow>(
    `
INSERT INTO "session" (sessionid, userid, title, mode, path, projectid, model)
VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
RETURNING sessionid, userid, title, lastupdated, mode, path, projectid, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata;
`,
    [
      input.sessionid ?? uuid7(),
      input.userid,
      input.title ?? "",
      input.mode ?? "none",
      input.path,
      input.projectid,
      JSON.stringify(input.model)
    ]
  );

  database.logger?.info("agent.server.session.create.complete", { sessionid: result.rows[0]?.sessionid });
  return result.rows[0];
}
