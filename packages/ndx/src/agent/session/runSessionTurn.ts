import { runAgentTurn, type NDXTurnInput, type NDXTurnLoopEvents } from "../turnloop/index.js";
import type { NDXDatabase, NDXModelConfig, NDXSessionRow } from "./types.js";

export function runSessionTurn(
  database: NDXDatabase,
  session: NDXSessionRow,
  input: NDXTurnInput,
  model?: NDXModelConfig,
  events: NDXTurnLoopEvents = {}
): Promise<void> {
  return runAgentTurn(database, session, input, model, events);
}
