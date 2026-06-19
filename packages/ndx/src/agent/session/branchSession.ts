import { appendCompactSessionHistory, type NDXCompactReport } from "../compact/index.js";
import { estimateContextTokens } from "../contextusage/index.js";
import { createSession } from "./createSession.js";
import { assertSessionHistoryMutationAllowed } from "./deleteSessionTurn.js";
import { getSession } from "./getSession.js";
import { listSessionData } from "./listSessionData.js";
import { sessionDataText, sessionDataTitleText } from "./content.js";
import { compactSourceForRows, sessionRowsThroughTurn, sessionTurnRangeForInput } from "./sessionTurnRange.js";
import { updateSessionTurnPhase } from "./interruptSession.js";
import { updateSessionEndTurn, updateSessionStartTurn } from "./updateSession.js";
import type { NDXDatabase, NDXSessionDataRow, NDXSessionRow } from "./types.js";

export type NDXBranchSessionResult = {
  sourceSession: NDXSessionRow;
  session: NDXSessionRow;
  compact: NDXSessionDataRow;
  inputDataId: string;
};

export type NDXBranchSessionStartResult = {
  sourceSession: NDXSessionRow;
  session: NDXSessionRow;
  inputDataId: string;
  report: NDXCompactReport;
  previousCompact?: NDXSessionDataRow;
  sourceRows: NDXSessionDataRow[];
  sourceInput: { dataId: string; text: string };
};

export async function createBranchSessionFromTurn(database: NDXDatabase, sessionid: string, inputDataId: string): Promise<NDXBranchSessionStartResult | undefined> {
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

  const created = await createSession(database, {
    userid: sourceSession.userid,
    projectname: sourceSession.projectname,
    mode: sourceSession.mode,
    model: sourceSession.model,
    title: branchTitle(turnRange.input)
  });
  await updateSessionStartTurn(database, created.sessionid);
  const session = await updateSessionTurnPhase(database, created.sessionid, "compacting");

  const { previousCompact, sourceRows } = compactSourceForRows(rowsThroughTurn);
  const sourceTokens = rowsThroughTurn.reduce((total, row) => total + estimateContextTokens(sessionDataText(row) ?? JSON.stringify(row.contents ?? "")), 0);
  const sourceInputText = sessionDataText(turnRange.input) ?? sessionDataTitleText(turnRange.input) ?? "Branched session";
  return {
    sourceSession,
    session,
    inputDataId,
    report: {
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
    previousCompact,
    sourceRows,
    sourceInput: { dataId: String(turnRange.input.dataid), text: sourceInputText }
  };
}

export async function compactBranchSession(database: NDXDatabase, branch: NDXBranchSessionStartResult): Promise<NDXBranchSessionResult> {
  try {
    const compact = await appendCompactSessionHistory(
      database,
      branch.session,
      branch.report,
      branch.sourceRows,
      branch.session.model,
      { previousCompact: branch.previousCompact, sourceInput: branch.sourceInput, fallbackMode: "throw" }
    );
    const session = await updateSessionEndTurn(database, branch.session.sessionid);
    return { sourceSession: branch.sourceSession, session, compact: compact.row, inputDataId: branch.inputDataId };
  } catch (error) {
    await updateSessionEndTurn(database, branch.session.sessionid).catch(() => undefined);
    throw error;
  }
}

export async function branchSessionFromTurn(database: NDXDatabase, sessionid: string, inputDataId: string): Promise<NDXBranchSessionResult | undefined> {
  const branch = await createBranchSessionFromTurn(database, sessionid, inputDataId);
  return branch ? compactBranchSession(database, branch) : undefined;
}

function branchTitle(input: NDXSessionDataRow): string {
  const title = (sessionDataTitleText(input) ?? "Branched session").trim();
  return `🚩${title}`;
}
