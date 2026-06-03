import { handleUserRequest } from "./request/index.js";
import type { NDXDatabase, NDXModelConfig, NDXSessionRow } from "../session/types.js";
import type { NDXTurnInput, NDXTurnLoopEvents } from "./types.js";

export async function runAgentTurn(
  database: NDXDatabase,
  session: NDXSessionRow,
  request: NDXTurnInput,
  model?: NDXModelConfig,
  events: NDXTurnLoopEvents = {}
): Promise<void> {
  await handleUserRequest(database, session, request, model, events);
}

export { buildTurnMessages, buildTurnMessageParts, buildTurnMessagesFromParts } from "./base/context/index.js";
export { getRuntimeTurnPhase, requestRuntimeTurnInterrupt, turnInterruptPolicy } from "./base/interrupt/index.js";
export type { NDXTurnMessageParts } from "./base/context/index.js";
export type { NDXTurnInput, NDXTurnLoopEvents, NDXTurnLoopEvent } from "./types.js";
export type { NDXTurnInterruptAction, NDXTurnPhase } from "./base/interrupt/index.js";
