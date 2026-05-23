import { runAgentTurn, type NDXTurnLoopEvents } from "../turnloop/index.js";
export { sessionDataRowsToModelMessages } from "./sessionDataRowsToModelMessages.js";
import type { NDXDatabase, NDXModelConfig, NDXSessionRow } from "./types.js";

export function runSessionTurn(
  database: NDXDatabase,
  session: NDXSessionRow,
  text: string,
  model?: NDXModelConfig,
  events: NDXTurnLoopEvents = {}
): Promise<void> {
  return runAgentTurn(database, session, text, model, events);
}
