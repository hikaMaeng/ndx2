import type { NDXDatabase } from "../init/index.js";
import type { NDXUserRow } from "./types.js";

export async function getUser(database: NDXDatabase, userid: string): Promise<NDXUserRow | undefined> {
  database.logger?.debug("agent.server.account.get_user.start", { userid });
  const result = await database.query<NDXUserRow>(
    `
SELECT userid, created
FROM users
WHERE userid = $1;
`,
    [userid]
  );

  database.logger?.debug("agent.server.account.get_user.complete", { userid, found: Boolean(result.rows[0]) });
  return result.rows[0];
}
