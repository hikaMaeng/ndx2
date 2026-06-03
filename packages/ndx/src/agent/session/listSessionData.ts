import type { NDXDatabase, NDXSessionDataRow } from "./types.js";

export async function listSessionData(database: NDXDatabase, sessionid: string): Promise<NDXSessionDataRow[]> {
  database.logger?.debug("agent.server.session_data.list.start", { sessionid });
  const result = await database.query<NDXSessionDataRow>(
    `
SELECT dataid, sessionid, type, contents, createdat
FROM sessiondata
WHERE sessionid = $1
ORDER BY sessiondata.dataid ASC;
`,
    [sessionid]
  );

  database.logger?.debug("agent.server.session_data.list.complete", { sessionid, count: result.rows.length });
  return result.rows;
}
