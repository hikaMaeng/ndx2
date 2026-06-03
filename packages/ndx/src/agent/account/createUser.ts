import type { NDXDatabase } from "../init/index.js";
import type { NDXUserRow } from "./types.js";

export async function createUser(database: NDXDatabase, userid: string): Promise<NDXUserRow> {
  database.logger?.info("agent.server.account.create_user.start", { userid });
  if (userid.length < 1 || Array.from(userid).length > 200 || /\p{White_Space}/u.test(userid)) {
    database.logger?.warn("agent.server.account.create_user.rejected", { userid, reason: "invalid_userid" });
    throw new Error("userid must be 1 to 200 Unicode characters and contain no Unicode whitespace.");
  }

  const result = await database.query<NDXUserRow>(
    `
INSERT INTO users (userid)
VALUES ($1)
RETURNING userid, created;
`,
    [userid]
  );

  database.logger?.info("agent.server.account.create_user.complete", { userid: result.rows[0]?.userid });
  return result.rows[0];
}
