import type { NDXDatabase } from "../init/index.js";
import type { NDXUserRow } from "./types.js";

/** Lists selectable accounts for session-client account selection. */
export async function listUser(database: NDXDatabase): Promise<NDXUserRow[]> {
  database.logger?.debug("agent.server.account.list_user.start");
  const result = await database.query<NDXUserRow>(`
SELECT userid, created
FROM users
ORDER BY userid ASC;
`);

  database.logger?.debug("agent.server.account.list_user.complete", { count: result.rows.length });
  return result.rows;
}
