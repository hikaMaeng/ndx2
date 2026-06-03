import { uuid7 } from "../../../common/uuid7/index.js";
import type { NDXChatFolderRow, NDXDatabase } from "../types.js";

export async function ensureRootChatFolder(database: NDXDatabase, userid: string): Promise<NDXChatFolderRow> {
  const normalizedUserid = userid.trim();
  if (!normalizedUserid) {
    throw new Error("userid is required.");
  }
  const result = await database.query<NDXChatFolderRow>(
    `
WITH inserted AS (
  INSERT INTO chatfolder (folderid, userid, title, kind, screenorder)
  VALUES ($1::uuid, $2, 'root', 'root', 0)
  ON CONFLICT (userid) WHERE kind = 'root' DO NOTHING
  RETURNING folderid::text AS folderid, userid, title, kind, screenorder, createdat, updatedat
)
SELECT folderid, userid, title, kind, screenorder, createdat, updatedat FROM inserted
UNION ALL
SELECT folderid::text AS folderid, userid, title, kind, screenorder, createdat, updatedat
FROM chatfolder
WHERE userid = $2
  AND kind = 'root'
LIMIT 1;
`,
    [uuid7(), normalizedUserid]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`root chat folder not found or created for user: ${normalizedUserid}`);
  }
  return row;
}

export async function listChatFolder(database: NDXDatabase, userid: string): Promise<NDXChatFolderRow[]> {
  await ensureRootChatFolder(database, userid);
  const result = await database.query<NDXChatFolderRow>(
    `
SELECT folderid::text AS folderid, userid, title, kind, screenorder, createdat, updatedat
FROM chatfolder
WHERE userid = $1
ORDER BY CASE WHEN kind = 'root' THEN 0 ELSE 1 END, screenorder ASC, createdat ASC;
`,
    [userid.trim()]
  );
  return result.rows;
}

export async function createChatFolder(database: NDXDatabase, userid: string, title: string): Promise<NDXChatFolderRow> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new Error("chat folder title is required.");
  }
  const result = await database.query<NDXChatFolderRow>(
    `
INSERT INTO chatfolder (folderid, userid, title, kind, screenorder)
VALUES ($1::uuid, $2, $3, 'normal', (SELECT COALESCE(MAX(screenorder), 0) + 1 FROM chatfolder WHERE userid = $2))
RETURNING folderid::text AS folderid, userid, title, kind, screenorder, createdat, updatedat;
`,
    [uuid7(), userid.trim(), normalizedTitle]
  );
  return result.rows[0];
}

export async function updateChatFolderTitle(database: NDXDatabase, folderid: string, userid: string, title: string): Promise<NDXChatFolderRow> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new Error("chat folder title is required.");
  }
  const result = await database.query<NDXChatFolderRow>(
    `
UPDATE chatfolder
SET title = $3, updatedat = now()
WHERE folderid = $1::uuid
  AND userid = $2
  AND kind <> 'root'
RETURNING folderid::text AS folderid, userid, title, kind, screenorder, createdat, updatedat;
`,
    [folderid, userid.trim(), normalizedTitle]
  );
  if (!result.rows[0]) {
    throw new Error("chat folder not found or root folder cannot be renamed.");
  }
  return result.rows[0];
}

export async function deleteChatFolder(database: NDXDatabase, folderid: string, userid: string): Promise<NDXChatFolderRow | undefined> {
  const result = await database.query<NDXChatFolderRow>(
    `
DELETE FROM chatfolder
WHERE folderid = $1::uuid
  AND userid = $2
  AND kind <> 'root'
RETURNING folderid::text AS folderid, userid, title, kind, screenorder, createdat, updatedat;
`,
    [folderid, userid.trim()]
  );
  return result.rows[0];
}
