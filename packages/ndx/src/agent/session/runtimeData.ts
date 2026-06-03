import type { NDXDatabase } from "./types.js";

const INLINE_ATTACHMENT_DATA_IDS_KEY = "inlineAttachmentDataIds";

export async function addInlineAttachmentDataIds(database: NDXDatabase, sessionid: string, dataids: Iterable<string | number>): Promise<void> {
  const values = [...new Set([...dataids].map(String).filter(Boolean))];
  if (values.length === 0) {
    return;
  }
  await database.query(
    `
UPDATE "session"
SET runtimedata = jsonb_set(
  COALESCE(runtimedata, '{}'::jsonb),
  $2::text[],
  COALESCE(runtimedata->$3, '[]'::jsonb) || $4::jsonb
)
WHERE sessionid = $1;
`,
    [sessionid, [INLINE_ATTACHMENT_DATA_IDS_KEY], INLINE_ATTACHMENT_DATA_IDS_KEY, JSON.stringify(values)]
  );
}

export async function listInlineAttachmentDataIds(database: NDXDatabase, sessionid: string): Promise<Set<string>> {
  const result = await database.query<{ ids: unknown }>(
    `
SELECT COALESCE(runtimedata->$2, '[]'::jsonb) AS ids
FROM "session"
WHERE sessionid = $1;
`,
    [sessionid, INLINE_ATTACHMENT_DATA_IDS_KEY]
  );
  return parseInlineAttachmentDataIds(result.rows[0]?.ids);
}

export async function consumeInlineAttachmentDataIds(database: NDXDatabase, sessionid: string): Promise<Set<string>> {
  const result = await database.query<{ ids: unknown }>(
    `
WITH current AS (
  SELECT COALESCE(runtimedata->$2, '[]'::jsonb) AS ids
  FROM "session"
  WHERE sessionid = $1
),
updated AS (
  UPDATE "session"
  SET runtimedata = COALESCE(runtimedata, '{}'::jsonb) - $2
  WHERE sessionid = $1
  RETURNING 1
)
SELECT current.ids FROM current, updated;
`,
    [sessionid, INLINE_ATTACHMENT_DATA_IDS_KEY]
  );
  return parseInlineAttachmentDataIds(result.rows[0]?.ids);
}

function parseInlineAttachmentDataIds(value: unknown): Set<string> {
  if (!Array.isArray(value)) {
    return new Set();
  }
  return new Set(value.filter((item): item is string | number => typeof item === "string" || typeof item === "number").map(String));
}
