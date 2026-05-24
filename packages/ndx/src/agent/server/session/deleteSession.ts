import { getRuntimeTurnPhase, requestRuntimeTurnInterrupt } from "../turnloop/interrupt.js";
import { completeSessionInterrupt, requestSessionInterrupt } from "./interruptSession.js";
import type { NDXDatabase, NDXSessionRow } from "./types.js";

export type NDXDeleteSessionOptions = {
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
};

export async function deleteSession(database: NDXDatabase, sessionid: string, options: NDXDeleteSessionOptions = {}): Promise<NDXSessionRow | undefined> {
  const waitTimeoutMs = options.waitTimeoutMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  const session = await selectSessionForDelete(database, sessionid);
  if (!session) {
    return undefined;
  }

  if (session.isrunning) {
    const runtimePhase = getRuntimeTurnPhase(sessionid);
    await requestSessionInterrupt(database, sessionid, runtimePhase);
    const runtimeInterrupt = requestRuntimeTurnInterrupt(sessionid);
    if (!runtimeInterrupt.accepted) {
      await completeSessionInterrupt(database, sessionid);
    }

    const deadline = Date.now() + waitTimeoutMs;
    while (Date.now() < deadline) {
      const current = await selectSessionForDelete(database, sessionid);
      if (!current || !current.isrunning) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    const current = await selectSessionForDelete(database, sessionid);
    if (current?.isrunning) {
      throw new Error(`Session is still running after interrupt: ${sessionid}`);
    }
  }

  database.logger?.info("agent.server.session.delete.start", { sessionid });
  await database.query(
    `
WITH deleted_tokens AS (
  DELETE FROM sessiontoken WHERE sessionid = $1 RETURNING 1
),
deleted_data AS (
  DELETE FROM sessiondata WHERE sessionid = $1 RETURNING 1
)
DELETE FROM "session" WHERE sessionid = $1;
`,
    [sessionid]
  );
  database.logger?.info("agent.server.session.delete.complete", { sessionid });
  return session;
}

async function selectSessionForDelete(database: NDXDatabase, sessionid: string): Promise<NDXSessionRow | undefined> {
  const result = await database.query<NDXSessionRow>(
    `
SELECT sessionid, userid, title, lastupdated, mode, path, projectid, model, isrunning, turnphase, interruptrequested, interruptrequestedat, interruptcompletedat, runtimedata
FROM "session"
WHERE sessionid = $1;
`,
    [sessionid]
  );
  return result.rows[0];
}
