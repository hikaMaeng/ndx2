import { isNDXCotWorkContents, NDX_TURN_EVENT, type NDXCotWorkContents } from "../../../../common/protocol/index.js";
import { appendSessionData } from "../../../session/appendSessionData.js";
import { cotWorkReminderContents } from "../../../session/content.js";
import type { NDXSessionDataRow } from "../../../session/types.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../../../hook/index.js";

export type NDXCotWorkReminderHookInsertionEvent = typeof NDX_TURN_EVENT.ContextPrepared;

export const cotWorkReminderHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.context.prepared.cot_work_reminder",
  source: "system",
  async run(context): Promise<NDXHookEffect> {
    if (!context.input || !context.iteration || context.iteration <= 1) {
      return { type: "noeffect" };
    }
    const rows = context.sessionDataRows ?? [];
    const turnRows = rows.filter((row) => Number(row.dataid) >= Number(context.input!.dataid));
    const latest = latestIncompleteCotWork(turnRows);
    if (!latest) {
      return { type: "noeffect" };
    }
    if (turnRows.some((row) => {
      const contents = row.contents as { kind?: unknown; sourceDataId?: unknown; iteration?: unknown } | undefined;
      return (
        contents?.kind === "cot_work_reminder" &&
        String(contents.sourceDataId) === String(latest.row.dataid) &&
        contents.iteration === context.iteration
      );
    })) {
      return { type: "noeffect" };
    }

    const text = cotWorkReminderText(latest.contents);
    await appendSessionData(
      context.database,
      context.session.sessionid,
      "system",
      cotWorkReminderContents(context.iteration, String(latest.row.dataid), text)
    );
    return { appendMessages: [{ role: "user", content: text }] };
  }
};

function latestIncompleteCotWork(rows: NDXSessionDataRow[]): { row: NDXSessionDataRow; contents: NDXCotWorkContents } | undefined {
  for (const row of [...rows].reverse()) {
    const contents = row.contents;
    if (!isNDXCotWorkContents(contents)) {
      continue;
    }
    if (contents.steps.every((step) => step.status === "completed")) {
      return undefined;
    }
    return { row, contents };
  }
  return undefined;
}

function cotWorkReminderText(contents: NDXCotWorkContents): string {
  const lines = [
    "cot_work reminder: Continue from the active plan below.",
    "Before doing more work, update cot_work if any step is completed, blocked, stale, or needs to change.",
    ...contents.steps.map((step, index) => `${index + 1}. [${step.status}] ${step.task}`)
  ];
  if (contents.reason?.trim()) {
    lines.splice(2, 0, `Current reason: ${contents.reason.trim()}`);
  }
  return lines.join("\n");
}
