import assert from "node:assert/strict";
import test from "node:test";
import { appendChatSessionMessageStream, type NDXAgentWebChatStreamEvent } from "./chat.js";

test("appendChatSessionMessageStream parses multiline SSE data frames", async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode([
        'data: {"kind":"assistant_delta",',
        'data: "text":"렌더링"}',
        "",
        'data: {"kind":"complete","session":{"chatsessionid":"chat-1","folderid":"folder-1","title":"테스트","createdat":"2026-06-19T00:00:00.000Z","updatedat":"2026-06-19T00:00:00.000Z"},"data":[]}',
        "",
        ""
      ].join("\n")));
      controller.close();
    }
  });
  const events: NDXAgentWebChatStreamEvent[] = [];

  globalThis.fetch = async () => new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
  try {
    const complete = await appendChatSessionMessageStream("chat-1", { text: "테스트" }, (event) => events.push(event));

    assert.equal(events[0]?.kind, "assistant_delta");
    assert.equal(events[0]?.kind === "assistant_delta" ? events[0].text : "", "렌더링");
    assert.equal(complete.session.chatsessionid, "chat-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
