import assert from "node:assert/strict";
import test from "node:test";
import type { NDXAgentWebChatSession, NDXAgentWebSessionData } from "ndx/webclient/common";
import { applyChatRequestCompleted, applyChatRequestStarted, applyChatSessionLoaded, applyChatStreamProgress, chatModelToUiState, createChatDraftModel } from "./model.js";

const session: NDXAgentWebChatSession = {
  chatsessionid: "chat-1",
  folderid: "folder-1",
  userid: "ndev",
  title: "채팅",
  model: { type: "openai", provider: "local", model: "gpt", url: "http://localhost", token: "", contextsize: 100000, modalities: ["text"], reasoningEffort: "medium" },
  isrunning: false,
  createdat: "2026-06-14T00:00:00.000Z",
  lastupdated: "2026-06-14T00:00:00.000Z"
};

test("chat model projects only final transcript messages from loaded rows", () => {
  const model = applyChatSessionLoaded(createChatDraftModel("folder-1"), session, rows());

  assert.deepEqual(chatModelToUiState(model).chatMessages.map((message) => message.id), ["1", "4"]);
});

test("chat model keeps live stream progress out of transcript until completion", () => {
  const started = applyChatRequestStarted(createChatDraftModel("folder-1"), "공덕역 근처 찾아줘");
  const streaming = applyChatStreamProgress(started);

  const streamingMessages = chatModelToUiState(streaming).chatMessages;
  assert.equal(streamingMessages.length, 2);
  assert.equal(streamingMessages[0]?.role, "user");
  assert.equal(streamingMessages[0]?.id.startsWith("pending-user:"), true);
  assert.equal(streamingMessages[1]?.id, "pending-assistant");

  const completed = applyChatRequestCompleted(streaming, session, rows());

  assert.deepEqual(chatModelToUiState(completed).chatMessages.map((message) => message.id), ["1", "4"]);
});

function rows(): NDXAgentWebSessionData[] {
  return [
    row("1", "user", { kind: "user_message", text: "공덕역 근처 찾아줘" }),
    row("2", "assistant", { kind: "assistant_reasoning", iteration: 1, summary: "Need search" }),
    row("3", "assistant", { kind: "assistant_delta", iteration: 1, delta: "검색합니다", content: "검색합니다" }),
    row("4", "assistant", { kind: "assistant_message", text: "## 결과\n- **버거킹**" })
  ];
}

function row(dataid: string, type: NDXAgentWebSessionData["type"], contents: NDXAgentWebSessionData["contents"]): NDXAgentWebSessionData {
  return {
    dataid,
    sessionid: "chat-1",
    type,
    contents,
    createdat: "2026-06-14T00:00:00.000Z"
  };
}
