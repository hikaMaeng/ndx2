import { spawn } from "node:child_process";
import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { recordTurnContextUsage } from "../../../compact/index.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

export type NDXTurnContextUsageHookInsertionEvent = typeof NDX_TURN_EVENT.TurnEnd;

export const turnEndContextUsageHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.end.turn_context_usage",
  source: "system",
  run(context): NDXHookEffect {
    if (!context.input || !context.assistant) {
      return { type: "noeffect" };
    }
    const inputDataId = String(context.input.dataid);
    const assistantDataId = String(context.assistant.dataid);
    const databaseUrl = process.env.NDX_DATABASE_URL;
    if (databaseUrl) {
      const child = spawn("sh", ["-c", TURN_CONTEXT_USAGE_UPDATE_SH], {
        stdio: "ignore",
        detached: true,
        env: {
          ...process.env,
          NDX_DATABASE_URL: databaseUrl,
          NDX_TURN_CONTEXT_INPUT_DATAID: inputDataId,
          NDX_TURN_CONTEXT_ASSISTANT_DATAID: assistantDataId
        }
      });
      child.unref();
      return { type: "noeffect" };
    }

    setImmediate(() => {
      void recordTurnContextUsage(context.database, context.input!, context.assistant!).catch((error: unknown) => {
        context.database.logger?.debug("agent.server.turn_context_usage.update_failed", {
          sessionid: context.session.sessionid,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    });
    return { type: "noeffect" };
  }
};

const TURN_CONTEXT_USAGE_UPDATE_SH = `
set -eu
command -v psql >/dev/null 2>&1 || exit 0
psql "$NDX_DATABASE_URL" -v input_dataid="$NDX_TURN_CONTEXT_INPUT_DATAID" -v assistant_dataid="$NDX_TURN_CONTEXT_ASSISTANT_DATAID" >/dev/null 2>&1 <<'SQL'
WITH turn_tokens AS (
  SELECT COALESCE(SUM(CEIL(OCTET_LENGTH(contents::text)::numeric / 4)), 0)::bigint AS tokens
  FROM sessiondata
  WHERE dataid >= :'input_dataid'::bigint
    AND dataid <= :'assistant_dataid'::bigint
),
updated AS (
  UPDATE turncontextusage
  SET
    turncount = turncount + 1,
    tokens = turncontextusage.tokens + turn_tokens.tokens,
    avgtokens = CEIL((turncontextusage.tokens + turn_tokens.tokens)::numeric / (turncontextusage.turncount + 1))::bigint
  FROM turn_tokens
  RETURNING 1
)
INSERT INTO turncontextusage (turncount, tokens, avgtokens)
SELECT 1, tokens, tokens FROM turn_tokens
WHERE NOT EXISTS (SELECT 1 FROM updated)
  AND NOT EXISTS (SELECT 1 FROM turncontextusage);
SQL
`;
