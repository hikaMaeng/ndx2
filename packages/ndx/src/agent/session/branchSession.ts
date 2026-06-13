import { appendCompactSessionHistory } from "../compact/index.js";
import { estimateContextTokens } from "../contextusage/index.js";
import { createSession } from "./createSession.js";
import { deleteSession } from "./deleteSession.js";
import { assertSessionHistoryMutationAllowed } from "./deleteSessionTurn.js";
import { getSession } from "./getSession.js";
import { listSessionData } from "./listSessionData.js";
import { sessionDataText, sessionDataTitleText } from "./content.js";
import { compactSourceForRows, sessionRowsThroughTurn, sessionTurnRangeForInput } from "./sessionTurnRange.js";
import type { NDXDatabase, NDXSessionDataRow, NDXSessionRow } from "./types.js";

export type NDXBranchSessionResult = {
  sourceSession: NDXSessionRow;
  session: NDXSessionRow;
  compact: NDXSessionDataRow;
  inputDataId: string;
};

export async function branchSessionFromTurn(database: NDXDatabase, sessionid: string, inputDataId: string): Promise<NDXBranchSessionResult | undefined> {
  const sourceSession = await getSession(database, sessionid);
  if (!sourceSession) {
    return undefined;
  }
  assertSessionHistoryMutationAllowed(sourceSession);

  const rows = await listSessionData(database, sessionid);
  const turnRange = sessionTurnRangeForInput(rows, inputDataId);
  const rowsThroughTurn = sessionRowsThroughTurn(rows, inputDataId);
  if (!turnRange || !rowsThroughTurn) {
    return undefined;
  }

  const session = await createSession(database, {
    userid: sourceSession.userid,
    projectname: sourceSession.projectname,
    mode: sourceSession.mode,
    model: sourceSession.model,
    title: branchTitle(turnRange.input)
  });

  try {
    const { previousCompact, sourceRows } = compactSourceForRows(rowsThroughTurn);
    const sourceTokens = rowsThroughTurn.reduce((total, row) => total + estimateContextTokens(sessionDataText(row) ?? JSON.stringify(row.contents ?? "")), 0);
    const sourceInputText = sessionDataText(turnRange.input) ?? sessionDataTitleText(turnRange.input) ?? "Branched session";
    const compact = await appendCompactSessionHistory(
      database,
      session,
      {
        phase: "turn_start",
        reason: "branch",
        tokens: sourceTokens,
        contextsize: session.model.contextsize,
        percent: session.model.contextsize > 0 ? Math.min(100, Math.round((sourceTokens / session.model.contextsize) * 100)) : 0,
        remainingTokens: Math.max(0, session.model.contextsize - sourceTokens),
        requiredTokens: 0,
        averageTurnTokens: 0,
        outputReserveTokens: 0
      },
      sourceRows,
      session.model,
      { previousCompact, sourceInput: { dataId: String(turnRange.input.dataid), text: sourceInputText } }
    );
    await database.query(`UPDATE "session" SET lastupdated = now() WHERE sessionid = $1;`, [session.sessionid]);
    return { sourceSession, session, compact: compact.row, inputDataId };
  } catch (error) {
    await deleteSession(database, session.sessionid).catch(() => undefined);
    throw error;
  }
}

function branchTitle(input: NDXSessionDataRow): string {
  const title = (sessionDataTitleText(input) ?? "Branched session").trim();
  return `🚩${title}`;
}
