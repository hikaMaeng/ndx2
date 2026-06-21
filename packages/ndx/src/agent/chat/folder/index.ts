import { uuid7 } from "../../../common/uuid7/index.js";
import type { NDXChatFolderRow, NDXDatabase } from "../types.js";

export async function ensureRootChatFolder(database: NDXDatabase): Promise<NDXChatFolderRow> {
  const result = await database.query<NDXChatFolderRow>(
    `
WITH inserted AS (
  INSERT INTO chatfolder (folderid, title, kind, screenorder)
  VALUES ($1::uuid, 'root', 'root', 0)
  ON CONFLICT (kind) WHERE kind = 'root' DO NOTHING
  RETURNING folderid::text AS folderid, title, kind, screenorder, createdat, updatedat
)
SELECT folderid, title, kind, screenorder, createdat, updatedat FROM inserted
UNION ALL
SELECT folderid::text AS folderid, title, kind, screenorder, createdat, updatedat
FROM chatfolder
WHERE kind = 'root'
LIMIT 1;
`,
    [uuid7()]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("root chat folder not found or created.");
  }
  return row;
}

export async function listChatFolder(database: NDXDatabase): Promise<NDXChatFolderRow[]> {
  await ensureRootChatFolder(database);
  const result = await database.query<NDXChatFolderRow>(
    `
SELECT folderid::text AS folderid, title, kind, screenorder, createdat, updatedat
FROM chatfolder
ORDER BY CASE WHEN kind = 'root' THEN 0 ELSE 1 END, screenorder ASC, createdat ASC;
`
  );
  return result.rows;
}

export async function createChatFolder(database: NDXDatabase, title: string): Promise<NDXChatFolderRow> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new Error("chat folder title is required.");
  }
  const result = await database.query<NDXChatFolderRow>(
    `
INSERT INTO chatfolder (folderid, title, kind, screenorder)
VALUES ($1::uuid, $2, 'normal', (SELECT COALESCE(MAX(screenorder), 0) + 1 FROM chatfolder))
RETURNING folderid::text AS folderid, title, kind, screenorder, createdat, updatedat;
`,
    [uuid7(), normalizedTitle]
  );
  return result.rows[0];
}

export async function updateChatFolderTitle(database: NDXDatabase, folderid: string, title: string): Promise<NDXChatFolderRow> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new Error("chat folder title is required.");
  }
  const result = await database.query<NDXChatFolderRow>(
    `
UPDATE chatfolder
SET title = $2, updatedat = now()
WHERE folderid = $1::uuid
  AND kind <> 'root'
RETURNING folderid::text AS folderid, title, kind, screenorder, createdat, updatedat;
`,
    [folderid, normalizedTitle]
  );
  if (!result.rows[0]) {
    throw new Error("chat folder not found or root folder cannot be renamed.");
  }
  return result.rows[0];
}

export async function deleteChatFolder(database: NDXDatabase, folderid: string): Promise<NDXChatFolderRow | undefined> {
  const result = await database.query<NDXChatFolderRow>(
    `
DELETE FROM chatfolder
WHERE folderid = $1::uuid
  AND kind <> 'root'
RETURNING folderid::text AS folderid, title, kind, screenorder, createdat, updatedat;
`,
    [folderid]
  );
  return result.rows[0];
}
