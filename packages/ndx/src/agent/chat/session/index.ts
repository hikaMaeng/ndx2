import { uuid7 } from "../../../common/uuid7/index.js";
import { sessionDataText } from "../../session/content.js";
import type { NDXChatSessionCreateInput, NDXChatSessionDataRow, NDXChatSessionRow, NDXDatabase, NDXModelConfig } from "../types.js";

const CHAT_SESSION_SELECT = `
SELECT chatsessionid::text AS chatsessionid, folderid::text AS folderid, title, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata, createdat, lastupdated
FROM chatsession
`;

export async function createChatSession(database: NDXDatabase, input: NDXChatSessionCreateInput): Promise<NDXChatSessionRow> {
  const result = await database.query<NDXChatSessionRow>(
    `
INSERT INTO chatsession (chatsessionid, folderid, title, model)
SELECT $1::uuid, chatfolder.folderid, $3, $4::jsonb
FROM chatfolder
WHERE chatfolder.folderid = $2::uuid
RETURNING chatsessionid::text AS chatsessionid, folderid::text AS folderid, title, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata, createdat, lastupdated;
`,
    [input.chatsessionid ?? uuid7(), input.folderid, input.title?.trim() ?? "", JSON.stringify(input.model)]
  );
  if (!result.rows[0]) {
    throw new Error("chat folder not found.");
  }
  return result.rows[0];
}

export async function getChatSession(database: NDXDatabase, chatsessionid: string): Promise<NDXChatSessionRow | undefined> {
  const result = await database.query<NDXChatSessionRow>(
    `${CHAT_SESSION_SELECT}
WHERE chatsessionid = $1::uuid;
`,
    [chatsessionid]
  );
  return result.rows[0];
}

export async function listChatSession(database: NDXDatabase, folderid: string): Promise<NDXChatSessionRow[]> {
  const result = await database.query<NDXChatSessionRow>(
    `${CHAT_SESSION_SELECT}
WHERE folderid = $1::uuid
ORDER BY lastupdated DESC, chatsessionid DESC;
`,
    [folderid]
  );
  return result.rows;
}

export async function updateChatSessionTitle(database: NDXDatabase, chatsessionid: string, title: string): Promise<NDXChatSessionRow> {
  const result = await database.query<NDXChatSessionRow>(
    `
UPDATE chatsession
SET title = $2, lastupdated = now()
WHERE chatsessionid = $1::uuid
RETURNING chatsessionid::text AS chatsessionid, folderid::text AS folderid, title, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata, createdat, lastupdated;
`,
    [chatsessionid, title.trim()]
  );
  if (!result.rows[0]) {
    throw new Error(`chat session not found: ${chatsessionid}`);
  }
  return result.rows[0];
}

export async function updateChatSessionStartTurn(database: NDXDatabase, chatsessionid: string, model?: NDXModelConfig): Promise<NDXChatSessionRow> {
  const result = await database.query<NDXChatSessionRow>(
    `
UPDATE chatsession
SET model = COALESCE($2::jsonb, model),
    isrunning = true,
    turnphase = 'starting',
    interruptrequested = false,
    interruptrequestedat = NULL,
    interruptcompletedat = NULL
WHERE chatsessionid = $1::uuid
RETURNING chatsessionid::text AS chatsessionid, folderid::text AS folderid, title, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata, createdat, lastupdated;
`,
    [chatsessionid, model ? JSON.stringify(model) : null]
  );
  if (!result.rows[0]) {
    throw new Error(`chat session not found: ${chatsessionid}`);
  }
  return result.rows[0];
}

export async function updateChatSessionEndTurn(database: NDXDatabase, chatsessionid: string): Promise<NDXChatSessionRow> {
  const result = await database.query<NDXChatSessionRow>(
    `
UPDATE chatsession
SET isrunning = false,
    turnphase = 'idle',
    lastupdated = now()
WHERE chatsessionid = $1::uuid
RETURNING chatsessionid::text AS chatsessionid, folderid::text AS folderid, title, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata, createdat, lastupdated;
`,
    [chatsessionid]
  );
  if (!result.rows[0]) {
    throw new Error(`chat session not found: ${chatsessionid}`);
  }
  return result.rows[0];
}

export async function deleteChatSession(database: NDXDatabase, chatsessionid: string): Promise<NDXChatSessionRow | undefined> {
  const session = await getChatSession(database, chatsessionid);
  if (!session) {
    return undefined;
  }
  if (session.isrunning) {
    throw new Error(`Chat session is running: ${chatsessionid}`);
  }
  await database.query(`DELETE FROM chatsession WHERE chatsessionid = $1::uuid;`, [chatsessionid]);
  return session;
}

export async function appendChatSessionData(database: NDXDatabase, chatsessionid: string, type: string, contents: unknown): Promise<NDXChatSessionDataRow> {
  const result = await database.query<NDXChatSessionDataRow>(
    `
INSERT INTO chatsessiondata (chatsessionid, type, contents)
VALUES ($1::uuid, $2, $3::jsonb)
RETURNING dataid::text AS dataid, chatsessionid::text AS chatsessionid, type, contents, createdat;
`,
    [chatsessionid, type, JSON.stringify(contents)]
  );
  const row = result.rows[0];
  await database.query(
    `
UPDATE chatsession
SET title = CASE WHEN title = '' AND $2 = 'user' THEN LEFT($3, 80) ELSE title END,
    lastupdated = now()
WHERE chatsessionid = $1::uuid;
`,
    [chatsessionid, type, sessionDataText({ type, contents })]
  );
  return row;
}

export async function listChatSessionData(database: NDXDatabase, chatsessionid: string): Promise<NDXChatSessionDataRow[]> {
  const result = await database.query<NDXChatSessionDataRow>(
    `
SELECT dataid::text AS dataid, chatsessionid::text AS chatsessionid, type, contents, createdat
FROM chatsessiondata
WHERE chatsessionid = $1::uuid
ORDER BY chatsessiondata.dataid ASC;
`,
    [chatsessionid]
  );
  return result.rows;
}
