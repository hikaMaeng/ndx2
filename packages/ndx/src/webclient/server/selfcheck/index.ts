import {
  getSelfcheck,
  listSelfcheck,
  listSelfcheckCandidates,
  listSelfcheckCursors,
  listSelfcheckRuns,
  runSelfcheckOnce,
  updateSelfcheckStatus,
  type NDXSelfcheckRunMode,
  type NDXSelfcheckStatus
} from "../../../agent/selfcheck/index.js";
import type { NDXDatabase } from "../../../agent/init/index.js";
import type {
  NDXAgentWebRunSelfcheckResponse,
  NDXAgentWebSelfcheckCandidatesResponse,
  NDXAgentWebSelfcheckCursorsResponse,
  NDXAgentWebSelfcheckDetailResponse,
  NDXAgentWebSelfcheckResponse,
  NDXAgentWebSelfcheckRunsResponse
} from "../../common/index.js";

export async function listWebSelfcheck(database: NDXDatabase, input: { status?: string; subjectkind?: string; subjectname?: string; limit?: number }): Promise<NDXAgentWebSelfcheckResponse> {
  return { selfchecks: (await listSelfcheck(database, input)).map(dateRow) };
}

export async function getWebSelfcheck(database: NDXDatabase, selfcheckid: string): Promise<NDXAgentWebSelfcheckDetailResponse> {
  const selfcheck = await getSelfcheck(database, selfcheckid);
  if (!selfcheck) throw new Error(`selfcheck not found: ${selfcheckid}`);
  return { selfcheck: dateRow(selfcheck) };
}

export async function updateWebSelfcheckStatus(database: NDXDatabase, selfcheckid: string, status: NDXSelfcheckStatus): Promise<NDXAgentWebSelfcheckDetailResponse> {
  return { selfcheck: dateRow(await updateSelfcheckStatus(database, selfcheckid, status)) };
}

export async function listWebSelfcheckCandidates(database: NDXDatabase, limit?: number): Promise<NDXAgentWebSelfcheckCandidatesResponse> {
  return { candidates: (await listSelfcheckCandidates(database, limit)).map(dateRow) };
}

export async function listWebSelfcheckCursors(database: NDXDatabase): Promise<NDXAgentWebSelfcheckCursorsResponse> {
  return { cursors: (await listSelfcheckCursors(database)).map(dateRow) };
}

export async function listWebSelfcheckRuns(database: NDXDatabase, limit?: number): Promise<NDXAgentWebSelfcheckRunsResponse> {
  return { runs: (await listSelfcheckRuns(database, limit)).map(dateRow) };
}

export async function runWebSelfcheck(database: NDXDatabase, userHome: string, input: { mode?: NDXSelfcheckRunMode; batchSize?: number; maxLlmAnalyses?: number }): Promise<NDXAgentWebRunSelfcheckResponse> {
  return runSelfcheckOnce(database, {
    userHome,
    mode: input.mode,
    batchSize: input.batchSize,
    maxLlmAnalyses: input.maxLlmAnalyses
  });
}

type DateSerialized<Row> = {
  [Key in keyof Row]: Date extends Row[Key] ? Exclude<Row[Key], Date> | string : Row[Key] extends Date ? string : Row[Key];
};

function dateRow<Row extends Record<string, unknown>>(row: Row): DateSerialized<Row> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])) as DateSerialized<Row>;
}
