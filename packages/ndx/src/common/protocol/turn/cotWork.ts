export const NDX_COT_WORK_CONTENT_KIND = "cot_work";

export const NDX_COT_WORK_STEP_STATUS = ["pending", "in_progress", "completed"] as const;

export type NDXCotWorkStepStatus = typeof NDX_COT_WORK_STEP_STATUS[number];

export type NDXCotWorkStep = {
  task: string;
  status: NDXCotWorkStepStatus;
  elapsed?: string;
  elapsedMs?: number;
};

export type NDXCotWorkContents = {
  kind: typeof NDX_COT_WORK_CONTENT_KIND;
  steps: NDXCotWorkStep[];
  reason?: string;
  totalElapsed?: string;
  totalElapsedMs?: number;
  timingUpdatedAt?: string;
};

export function isNDXCotWorkContents(value: unknown): value is NDXCotWorkContents {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as { kind?: unknown; steps?: unknown; reason?: unknown; totalElapsed?: unknown; totalElapsedMs?: unknown; timingUpdatedAt?: unknown };
  return (
    record.kind === NDX_COT_WORK_CONTENT_KIND &&
    Array.isArray(record.steps) &&
    record.steps.length > 0 &&
    record.steps.every((step) => {
      if (!step || typeof step !== "object" || Array.isArray(step)) return false;
      const item = step as { task?: unknown; status?: unknown; elapsed?: unknown; elapsedMs?: unknown };
      return (
        typeof item.task === "string" &&
        item.task.trim().length > 0 &&
        (NDX_COT_WORK_STEP_STATUS as readonly unknown[]).includes(item.status) &&
        (item.elapsed === undefined || isCotWorkElapsed(item.elapsed)) &&
        (item.elapsedMs === undefined || isNonNegativeInteger(item.elapsedMs))
      );
    }) &&
    (record.reason === undefined || typeof record.reason === "string") &&
    (record.totalElapsed === undefined || isCotWorkElapsed(record.totalElapsed)) &&
    (record.totalElapsedMs === undefined || isNonNegativeInteger(record.totalElapsedMs)) &&
    (record.timingUpdatedAt === undefined || typeof record.timingUpdatedAt === "string")
  );
}

export function formatNDXCotWorkElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function isCotWorkElapsed(value: unknown): value is string {
  return typeof value === "string" && /^\d{2,}:\d{2}$/.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
