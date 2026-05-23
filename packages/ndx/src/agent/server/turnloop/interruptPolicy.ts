export type NDXTurnPhase = "starting" | "context" | "model_request" | "tool_execution" | "model_resume" | "finalizing" | "interrupted";

export type NDXTurnInterruptAction = "checkpoint_only" | "abort_model_request" | "abort_tool_execution";

export type NDXTurnInterruptPolicy = {
  phase: NDXTurnPhase;
  action: NDXTurnInterruptAction;
  abortSignal: boolean;
};

export function turnInterruptPolicy(phase: NDXTurnPhase): NDXTurnInterruptPolicy {
  if (phase === "model_request") {
    return { phase, action: "abort_model_request", abortSignal: true };
  }
  if (phase === "tool_execution") {
    return { phase, action: "abort_tool_execution", abortSignal: true };
  }
  return { phase, action: "checkpoint_only", abortSignal: false };
}

export function normalizeTurnPhase(value: string | undefined): NDXTurnPhase | undefined {
  if (
    value === "starting" ||
    value === "context" ||
    value === "model_request" ||
    value === "tool_execution" ||
    value === "model_resume" ||
    value === "finalizing" ||
    value === "interrupted"
  ) {
    return value;
  }
  return undefined;
}
