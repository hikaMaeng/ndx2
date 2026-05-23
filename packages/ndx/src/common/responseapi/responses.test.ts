import assert from "node:assert/strict";
import test from "node:test";
import { buildResponsesToolContinuationInput, parseResponsesPayload, readResponsesStream } from "./responses.js";

test("parseResponsesPayload treats text tool_code blocks as function calls", () => {
  const parsed = parseResponsesPayload({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "먼저 스킬을 로드합니다.\n<tool_code>loadSkill(name=\"web-service-scaffold\")</tool_code>"
          }
        ]
      }
    ]
  });

  assert.equal(parsed.toolCalls.length, 1);
  assert.deepEqual(parsed.toolCalls[0], {
    type: "function_call",
    source: "text_tool_code",
    call_id: "text_tool_call_1",
    name: "loadSkill",
    arguments: JSON.stringify({ name: "web-service-scaffold" })
  });
});

test("readResponsesStream extracts text tool_code blocks split across stream chunks", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"<tool_code>loadSkill(name=\\\"web-service"}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"-scaffold\\\")</tool_code>"}\n\n'));
      controller.close();
    }
  });
  const toolCalls: unknown[] = [];

  const response = await readResponsesStream(stream, {
    async onToolCall(toolCall) {
      toolCalls.push(toolCall);
    }
  });

  assert.equal(response.toolCalls.length, 1);
  assert.equal(toolCalls.length, 1);
  assert.deepEqual(response.toolCalls[0], {
    type: "function_call",
    source: "text_tool_code",
    call_id: "text_tool_call_1",
    name: "loadSkill",
    arguments: JSON.stringify({ name: "web-service-scaffold" })
  });
});

test("readResponsesStream inspects completed response output after streamed text", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"도구를 호출합니다."}\n\n'));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: "response.completed",
        response: {
          output: [
            { type: "message", content: [{ type: "output_text", text: "도구를 호출합니다." }] },
            { type: "function_call", call_id: "call_1", name: "loadSkill", arguments: JSON.stringify({ name: "web-service-scaffold" }) }
          ]
        }
      })}\n\n`));
      controller.close();
    }
  });
  const toolCalls: unknown[] = [];

  const response = await readResponsesStream(stream, {
    async onToolCall(toolCall) {
      toolCalls.push(toolCall);
    }
  });

  assert.equal(response.content, "도구를 호출합니다.");
  assert.equal(response.toolCalls.length, 1);
  assert.equal(toolCalls.length, 1);
  assert.deepEqual(response.toolCalls[0], {
    type: "function_call",
    call_id: "call_1",
    name: "loadSkill",
    arguments: JSON.stringify({ name: "web-service-scaffold" })
  });
});

test("parseResponsesPayload reads reasoning content text when summary is empty", () => {
  const parsed = parseResponsesPayload({
    output: [
      {
        id: "rs_1",
        type: "reasoning",
        status: "completed",
        summary: [],
        content: [
          {
            type: "reasoning_text",
            text: "이제 packages/core의 package.json을 생성하겠습니다.\n"
          }
        ]
      }
    ]
  });

  assert.deepEqual(parsed.reasoning, ["이제 packages/core의 package.json을 생성하겠습니다.\n"]);
});

test("readResponsesStream emits cumulative reasoning text deltas", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.reasoning_text.delta","delta":"패키지"}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"response.reasoning_text.delta","delta":" 파일을 생성합니다."}\n\n'));
      controller.close();
    }
  });
  const reasoning: string[] = [];

  await readResponsesStream(stream, {
    async onReasoning(summary) {
      reasoning.push(summary);
    }
  });

  assert.deepEqual(reasoning, ["패키지", "패키지 파일을 생성합니다."]);
});

test("readResponsesStream lets event listeners interrupt the stream", async () => {
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.reasoning_text.delta","delta":"계속"}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"response.reasoning_text.delta","delta":" 생성"}\n\n'));
    },
    cancel() {
      cancelled = true;
    }
  });

  await assert.rejects(
    readResponsesStream(stream, {
      async onReasoning(_summary, _content, interrupt) {
        await interrupt("guard stopped the stream");
      }
    }),
    /guard stopped the stream/
  );
  assert.equal(cancelled, true);
});

test("buildResponsesToolContinuationInput carries synthetic text tool calls instead of assistant text", () => {
  const parsed = parseResponsesPayload({
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: "<tool_code>loadSkill(name=\"demo\")</tool_code>" }]
      }
    ]
  });

  const input = buildResponsesToolContinuationInput([{ role: "user", content: "load skill" }], parsed, [
    { toolCall: parsed.toolCalls[0], output: "<skill>demo</skill>" }
  ]);

  assert.deepEqual(input.slice(1), [
    {
      type: "function_call",
      source: "text_tool_code",
      call_id: "text_tool_call_1",
      name: "loadSkill",
      arguments: JSON.stringify({ name: "demo" })
    },
    {
      type: "function_call_output",
      call_id: "text_tool_call_1",
      output: "<skill>demo</skill>"
    }
  ]);
});
