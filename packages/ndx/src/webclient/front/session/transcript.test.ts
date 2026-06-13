import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage } from "./chat.js";
import { sessionTranscriptItems } from "./transcript.js";
import type { TurnFlowState } from "./turn/index.js";

test("transcript places a matched turn immediately after its user message and before the final assistant", () => {
  const items = sessionTranscriptItems([
    message("input-1", "user", "요청"),
    message("assistant-1", "assistant", "완료")
  ], [turn("input-1", "completed")]);

  assert.deepEqual(items.map(itemKey), [
    "message:input-1",
    "turn:input-1",
    "message:assistant-1"
  ]);
});

test("transcript keeps an unmatched completed turn before the first assistant message", () => {
  const items = sessionTranscriptItems([
    message("pending-user:1", "user", "요청 처리 중"),
    message("assistant-1", "assistant", "완료")
  ], [turn("input-1", "completed")]);

  assert.deepEqual(items.map(itemKey), [
    "message:pending-user:1",
    "turn:input-1",
    "message:assistant-1"
  ]);
});

function message(id: string, role: ChatMessage["role"], text: string): ChatMessage {
  return { id, role, text, attachments: [] };
}

function turn(inputDataId: string, status: TurnFlowState["status"]): TurnFlowState {
  return {
    id: `turn:session-1:${inputDataId}`,
    inputDataId,
    sessionid: "session-1",
    title: "요청",
    status,
    collapsed: true,
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:01.000Z",
    batches: []
  };
}

function itemKey(item: ReturnType<typeof sessionTranscriptItems>[number]): string {
  return item.kind === "message" ? `message:${item.message.id}` : `turn:${item.turn.inputDataId}`;
}
