import type { NDXHookRunResult } from "../hook/index.js";
import type { NDXDatabase, NDXSessionDataRow, NDXSessionRow } from "../session/types.js";

export async function recordSelfcheckHookRun(
  database: NDXDatabase,
  context: {
    session: NDXSessionRow;
    input?: NDXSessionDataRow;
    assistant?: NDXSessionDataRow;
    iteration?: number;
  },
  result: NDXHookRunResult
): Promise<void> {
  if (result.executions.length === 0 || !isMeaningfulHookRun(result)) {
    return;
  }
  const effect = result.effect;
  const relatedDataIds = [context.input?.dataid, context.assistant?.dataid].filter((value): value is string => typeof value === "string");
  await database.query(
    `
INSERT INTO selfcheck_hookrun (
  sessionid,
  eventname,
  hookname,
  completedat,
  status,
  effectsummary,
  stoppedturn,
  interruptedresponse,
  replacedrequest,
  replacedtoolcalls,
  replacedtoolresults,
  finalassistanttext,
  error,
  relateddataids
)
VALUES ($1, $2, $3, now(), $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13::bigint[]);
`,
    [
      context.session.sessionid,
      result.event,
      result.executions.map((execution) => execution.hook).join(", "),
      result.executions.some((execution) => execution.error) ? "failed" : "completed",
      JSON.stringify({
        executionCount: result.executions.length,
        diagnostics: effect.diagnostics ?? [],
        hasFinalAssistantText: typeof effect.finalAssistantText === "string" && effect.finalAssistantText.length > 0,
        hasPrefixDrifts: (effect.prefixDrifts ?? []).length > 0,
        compact: effect.compact ? { phase: effect.compact.report.phase } : undefined
      }),
      effect.stopTurn === true,
      effect.interruptModelResponse === true,
      typeof effect.replaceRequestText === "string",
      Array.isArray(effect.replaceToolCalls),
      Array.isArray(effect.replaceToolResults),
      typeof effect.finalAssistantText === "string" ? effect.finalAssistantText.slice(0, 20_000) : null,
      result.executions.find((execution) => execution.error)?.error instanceof Error
        ? (result.executions.find((execution) => execution.error)?.error as Error).message
        : result.executions.find((execution) => execution.error)?.error
          ? String(result.executions.find((execution) => execution.error)?.error)
          : null,
      relatedDataIds
    ]
  );
}

function isMeaningfulHookRun(result: NDXHookRunResult): boolean {
  const effect = result.effect;
  return result.executions.some((execution) => execution.error)
    || effect.stopTurn === true
    || effect.interruptModelResponse === true
    || typeof effect.replaceRequestText === "string"
    || Array.isArray(effect.replaceToolCalls)
    || Array.isArray(effect.replaceToolResults)
    || typeof effect.finalAssistantText === "string";
}
