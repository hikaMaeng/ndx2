import test from "node:test";
import assert from "node:assert/strict";
import type { NDXAgentWebSessionData } from "ndx/webclient/common";
import { chatMessagesFromSessionDataRows, sessionDataContentsText } from "./chat.js";

test("sessionDataContentsText shows only original user request from ndx request wrapper", () => {
  const text = [
    "<request thinking=\"low\">",
    "<thinking_instruction>",
    "Do not think in the model response.",
    "</thinking_instruction>",
    "<user_request>",
    "수정하고 배포해",
    "</user_request>",
    "</request>"
  ].join("\n");

  assert.equal(sessionDataContentsText({ kind: "user_message", text }), "수정하고 배포해");
});

test("sessionDataContentsText keeps legacy ndx request wrapper display-compatible", () => {
  const text = [
    "<ndx_request reasoning=\"nothink\">",
    "<user_request>",
    "수정하고 배포해",
    "</user_request>",
    "<execution_policy>",
    "Do not think in the model response.",
    "</execution_policy>",
    "</ndx_request>"
  ].join("\n");

  assert.equal(sessionDataContentsText({ kind: "user_message", text }), "수정하고 배포해");
});

test("chatMessagesFromSessionDataRows hides assistant stream internals", () => {
  const rows: NDXAgentWebSessionData[] = [
    row("1", "user", { kind: "user_message", text: "공덕역 근처의 브랜드 패스트푸드점을 전부 찾아줘" }),
    row("2", "assistant", { kind: "assistant_reasoning", iteration: 1, summary: "We need answer in Korean" }),
    row("3", "assistant", { kind: "assistant_delta", iteration: 1, delta: "중간", content: "중간 답변" }),
    row("4", "assistant", { kind: "assistant_message", text: "## 버거\n- **버거킹**" })
  ];

  const messages = chatMessagesFromSessionDataRows(rows);

  assert.deepEqual(messages.map((message) => ({ id: message.id, role: message.role, text: message.text })), [
    { id: "1", role: "user", text: "공덕역 근처의 브랜드 패스트푸드점을 전부 찾아줘" },
    { id: "4", role: "assistant", text: "## 버거\n- **버거킹**" }
  ]);
});

function row(dataid: string, type: NDXAgentWebSessionData["type"], contents: NDXAgentWebSessionData["contents"]): NDXAgentWebSessionData {
  return {
    dataid,
    sessionid: "chat-1",
    type,
    contents,
    createdat: "2026-06-14T00:00:00.000Z"
  };
}
