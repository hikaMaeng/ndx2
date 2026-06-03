import { getSession } from "../../../session/getSession.js";
import { updateSessionTurnPhase } from "../../../session/interruptSession.js";
import type { NDXDatabase } from "../../../session/types.js";

export type NDXTurnPhase = "starting" | "context" | "compacting" | "model_request" | "tool_execution" | "model_resume" | "finalizing" | "interrupted";

export type NDXTurnInterruptAction = "checkpoint_only" | "abort_model_request" | "abort_tool_execution";

export type NDXTurnInterruptPolicy = {
  phase: NDXTurnPhase;
  action: NDXTurnInterruptAction;
  abortSignal: boolean;
};

export type NDXTurnInterruptScope = ReturnType<typeof beginTurnInterruptScope>;

export class NDXTurnInterruptedError extends Error {
  readonly phase: NDXTurnPhase;

  constructor(phase: NDXTurnPhase) {
    super(`Turn interrupted during ${phase}.`);
    this.name = "NDXTurnInterruptedError";
    this.phase = phase;
  }
}

type TurnInterruptState = {
  controller: AbortController;
  phase: NDXTurnPhase;
};

const activeTurns = new Map<string, TurnInterruptState>();

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
    value === "compacting" ||
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

export function beginTurnInterruptScope(database: NDXDatabase, sessionid: string) {
  const state: TurnInterruptState = {
    controller: new AbortController(),
    phase: "starting"
  };
  activeTurns.set(sessionid, state);

  return {
    signal: state.controller.signal,
    async setPhase(phase: NDXTurnPhase) {
      state.phase = phase;
      await updateSessionTurnPhase(database, sessionid, phase);
      await checkpointTurnInterrupt(database, sessionid);
    },
    async checkpoint() {
      await checkpointTurnInterrupt(database, sessionid);
    },
    complete() {
      if (activeTurns.get(sessionid) === state) {
        activeTurns.delete(sessionid);
      }
    }
  };
}

export function requestRuntimeTurnInterrupt(sessionid: string): { accepted: boolean; phase?: NDXTurnPhase; action?: NDXTurnInterruptAction; signalAborted?: boolean } {
  const state = activeTurns.get(sessionid);
  if (!state) {
    return { accepted: false };
  }
  const phase = state.phase;
  const policy = turnInterruptPolicy(phase);
  state.phase = "interrupted";
  let signalAborted = false;
  if (policy.abortSignal && !state.controller.signal.aborted) {
    state.controller.abort(new NDXTurnInterruptedError(phase));
    signalAborted = true;
  }
  return { accepted: true, phase, action: policy.action, signalAborted };
}

export function getRuntimeTurnPhase(sessionid: string): NDXTurnPhase | undefined {
  return activeTurns.get(sessionid)?.phase;
}

export async function checkpointTurnInterrupt(database: NDXDatabase, sessionid: string): Promise<void> {
  const state = activeTurns.get(sessionid);
  const session = await getSession(database, sessionid);
  if (!session?.interruptrequested && !state?.controller.signal.aborted) {
    return;
  }

  const phase = normalizeTurnPhase(session?.turnphase) ?? state?.phase ?? "interrupted";
  const policy = turnInterruptPolicy(phase);
  if (state && policy.abortSignal && !state.controller.signal.aborted) {
    state.controller.abort(new NDXTurnInterruptedError(phase));
  }
  throw new NDXTurnInterruptedError(phase);
}

export function isTurnInterruptedError(error: unknown): error is NDXTurnInterruptedError {
  return error instanceof NDXTurnInterruptedError || Boolean(error && typeof error === "object" && (error as { name?: unknown }).name === "NDXTurnInterruptedError");
}
