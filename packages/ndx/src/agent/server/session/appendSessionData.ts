import type { NDXDatabase, NDXSessionDataRow } from "./types.js";
import { sessionDataText } from "./content.js";

export async function appendSessionData(database: NDXDatabase, sessionid: string, type: string, contents: unknown): Promise<NDXSessionDataRow> {
  database.logger?.info("agent.server.session_data.append.start", { sessionid, type });
  const result = await database.query<NDXSessionDataRow>(
    `
INSERT INTO sessiondata (sessionid, type, contents)
VALUES ($1, $2, $3::jsonb)
RETURNING dataid, sessionid, type, contents, createdat;
`,
    [sessionid, type, JSON.stringify(contents)]
  );

  await database.query(
    `
UPDATE "session"
SET
      title = CASE
	    WHEN title = '' AND $2 = 'user' AND $3::text <> '' THEN $3::text
	    ELSE title
	  END,
  lastupdated = now()
WHERE sessionid = $1;
`,
    [sessionid, type, sessionDataText({ type, contents }) ?? ""]
  );

  database.logger?.info("agent.server.session_data.append.complete", {
    sessionid,
    type,
    dataid: String(result.rows[0]?.dataid)
  });
  return result.rows[0];
}
