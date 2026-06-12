import { getRuntimeTurnPhase } from "../turnloop/index.js";
import { rebuildTurnContextUsage } from "../compact/index.js";
import { getSession } from "./getSession.js";
import { listSessionData } from "./listSessionData.js";
import { sessionTurnRangeForInput } from "./sessionTurnRange.js";
import type { NDXDatabase, NDXSessionDataRow, NDXSessionRow } from "./types.js";

export type NDXDeleteSessionTurnResult = {
  session: NDXSessionRow;
  inputDataId: string;
  deletedDataIds: string[];
};

export async function deleteSessionTurn(database: NDXDatabase, sessionid: string, inputDataId: string): Promise<NDXDeleteSessionTurnResult | undefined> {
  const session = await getSession(database, sessionid);
  if (!session) {
    return undefined;
  }
  assertSessionHistoryMutationAllowed(session);
  const range = sessionTurnRangeForInput(await listSessionData(database, sessionid), inputDataId);
  if (!range) {
    return undefined;
  }
  const dataids = range.rows.map((row) => String(row.dataid));
  const deleted = await database.query<NDXSessionDataRow>(
    `
DELETE FROM sessiondata
WHERE sessionid = $1
  AND dataid = ANY($2::bigint[])
RETURNING dataid, sessionid, type, contents, createdat;
`,
    [sessionid, dataids]
  );
  await database.query(`UPDATE "session" SET lastupdated = now() WHERE sessionid = $1;`, [sessionid]);
  await rebuildTurnContextUsage(database);
  return {
    session,
    inputDataId,
    deletedDataIds: deleted.rows.map((row) => String(row.dataid))
  };
}

export function assertSessionHistoryMutationAllowed(session: NDXSessionRow): void {
  if (session.isrunning || session.turnphase !== "idle" || session.interruptrequested || getRuntimeTurnPhase(session.sessionid)) {
    throw new Error("세션 실행 또는 인터럽트 처리가 진행 중입니다. 완료 후 다시 시도하세요.");
  }
}
