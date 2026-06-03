import { formatNDXCotWorkElapsed, type NDXCotWorkContents, type NDXCotWorkStepStatus } from "../../../../common/protocol/index.js";

type CotWorkStepTiming = {
  status: NDXCotWorkStepStatus;
  elapsedMs: number;
};

export type NDXCotWorkTimingTracker = {
  update: (contents: NDXCotWorkContents) => NDXCotWorkContents;
  complete: () => NDXCotWorkContents | undefined;
};

export function createCotWorkTimingTracker(): NDXCotWorkTimingTracker {
  let planStartedAt = 0;
  let lastUpdatedAt = 0;
  let latestContents: NDXCotWorkContents | undefined;
  const steps = new Map<string, CotWorkStepTiming>();
  const update = (contents: NDXCotWorkContents) => {
    const now = Date.now();
    if (planStartedAt === 0) {
      planStartedAt = now;
    }
    const updateElapsedMs = lastUpdatedAt === 0 ? 0 : now - lastUpdatedAt;
    const nextSteps = new Map<string, CotWorkStepTiming>();
    const timedSteps = contents.steps.map((step, index) => {
      const key = `${index}:${step.task}`;
      const previous = steps.get(key);
      let elapsedMs = previous?.elapsedMs ?? 0;
      if (step.status === "completed" && previous?.status !== "completed") {
        elapsedMs += updateElapsedMs;
      } else if (step.status === "in_progress" && previous?.status === "in_progress") {
        elapsedMs += updateElapsedMs;
      } else if (step.status === "pending" && previous?.status !== "completed") {
        elapsedMs = 0;
      }
      nextSteps.set(key, { status: step.status, elapsedMs });
      return {
        ...step,
        elapsed: formatNDXCotWorkElapsed(elapsedMs),
        elapsedMs
      };
    });
    steps.clear();
    for (const [key, value] of nextSteps) {
      steps.set(key, value);
    }
    lastUpdatedAt = now;
    const totalElapsedMs = now - planStartedAt;
    latestContents = {
      ...contents,
      steps: timedSteps,
      totalElapsed: formatNDXCotWorkElapsed(totalElapsedMs),
      totalElapsedMs,
      timingUpdatedAt: new Date(now).toISOString()
    };
    return latestContents;
  };
  return {
    update,
    complete() {
      if (!latestContents || latestContents.steps.every((step) => step.status === "completed")) {
        return latestContents;
      }
      return update({
        ...latestContents,
        steps: latestContents.steps.map((step) => ({ ...step, status: "completed" }))
      });
    }
  };
}
