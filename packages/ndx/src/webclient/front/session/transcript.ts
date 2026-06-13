import type { ChatMessage } from "./chat.js";
import type { TurnFlowState } from "./turn/index.js";

export type SessionTranscriptItem =
  | { kind: "message"; message: ChatMessage }
  | { kind: "turn"; turn: TurnFlowState };

export function sessionTranscriptItems(messages: ChatMessage[], turns: TurnFlowState[]): SessionTranscriptItem[] {
  const messageIds = new Set(messages.map((message) => message.id));
  const turnsByInput = new Map<string, TurnFlowState[]>();
  const unmatchedTurns = turns.filter((turn) => !messageIds.has(turn.inputDataId));
  const output: SessionTranscriptItem[] = [];
  let unmatchedInserted = false;

  for (const turn of turns) {
    if (!messageIds.has(turn.inputDataId)) continue;
    turnsByInput.set(turn.inputDataId, [...(turnsByInput.get(turn.inputDataId) ?? []), turn]);
  }

  const appendUnmatchedTurns = () => {
    if (unmatchedInserted) return;
    unmatchedInserted = true;
    output.push(...unmatchedTurns.map((turn) => ({ kind: "turn" as const, turn })));
  };

  for (const message of messages) {
    if (message.role === "assistant") {
      appendUnmatchedTurns();
    }
    output.push({ kind: "message", message });
    if (message.role !== "user") continue;
    output.push(...(turnsByInput.get(message.id) ?? []).map((turn) => ({ kind: "turn" as const, turn })));
  }

  appendUnmatchedTurns();
  return output;
}
