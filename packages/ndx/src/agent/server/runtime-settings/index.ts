import { promises as fs } from "node:fs";
import path from "node:path";

export const DEFAULT_NDX_MAX_MODEL_ITERATIONS = 500;
export const DEFAULT_NDX_LOOP_DETECTION_INTERVAL = 50;

export type NDXAgentRuntimeSettings = {
  maxModelIterations: number;
  loopDetectionInterval: number;
};

export async function readAgentRuntimeSettings(userHome: string): Promise<NDXAgentRuntimeSettings> {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(userHome, ".ndx", "settings.json"), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return defaultAgentRuntimeSettings();
    const runtime = (parsed as { runtime?: unknown }).runtime;
    if (!runtime || typeof runtime !== "object") return defaultAgentRuntimeSettings();
    const maxModelIterations = (runtime as { maxModelIterations?: unknown }).maxModelIterations;
    const loopDetectionInterval = (runtime as { loopDetectionInterval?: unknown }).loopDetectionInterval;
    return {
      maxModelIterations: typeof maxModelIterations === "number" && Number.isInteger(maxModelIterations) && maxModelIterations > 0
        ? maxModelIterations
        : DEFAULT_NDX_MAX_MODEL_ITERATIONS,
      loopDetectionInterval: typeof loopDetectionInterval === "number" && Number.isInteger(loopDetectionInterval)
        ? loopDetectionInterval
        : DEFAULT_NDX_LOOP_DETECTION_INTERVAL
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultAgentRuntimeSettings();
    }
    throw error;
  }
}

function defaultAgentRuntimeSettings(): NDXAgentRuntimeSettings {
  return {
    maxModelIterations: DEFAULT_NDX_MAX_MODEL_ITERATIONS,
    loopDetectionInterval: DEFAULT_NDX_LOOP_DETECTION_INTERVAL
  };
}
