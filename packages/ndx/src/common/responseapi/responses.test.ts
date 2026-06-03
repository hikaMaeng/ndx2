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

test("parseResponsesPayload parses tagged tool_call parameters and removes the tool text from assistant content", () => {
  const parsed = parseResponsesPayload({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: [
              "<tool_call>",
              "tool_call write_file (call_4275492115020872)",
              "<parameter=content>",
              "export {};",
              "</parameter>",
              "<parameter=file_path>",
              "/ndx/workspace/test1/packages/tetris_domain/src/server/index.ts",
              "</parameter>",
              "</function>",
              "</tool_call>"
            ].join("\n")
          }
        ]
      }
    ]
  });

  assert.equal(parsed.content, "");
  assert.deepEqual(parsed.toolCalls[0], {
    type: "function_call",
    source: "text_tool_code",
    call_id: "call_4275492115020872",
    name: "write_file",
    arguments: JSON.stringify({
      content: "export {};",
      file_path: "/ndx/workspace/test1/packages/tetris_domain/src/server/index.ts"
    })
  });
});

test("parseResponsesPayload treats parameterless tagged tool_call as an empty-argument function call", () => {
  const parsed = parseResponsesPayload({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: [
              "<tool_call>",
              "tool_call list_files (call_1)",
              "</tool_call>"
            ].join("\n")
          }
        ]
      }
    ]
  });

  assert.equal(parsed.content, "");
  assert.deepEqual(parsed.toolCalls[0], {
    type: "function_call",
    source: "text_tool_code",
    call_id: "call_1",
    name: "list_files",
    arguments: "{}"
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

test("readResponsesStream preserves leading spaces across streamed text deltas", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"분석"}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":" 결과"}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":", `tick()`"}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":" 함수"}\n\n'));
      controller.close();
    }
  });
  const deltas: string[] = [];

  const response = await readResponsesStream(stream, {
    async onText(_delta, content) {
      deltas.push(content);
    }
  });

  assert.equal(response.content, "분석 결과, `tick()` 함수");
  assert.deepEqual(deltas, [
    "분석",
    "분석 결과",
    "분석 결과, `tick()`",
    "분석 결과, `tick()` 함수"
  ]);
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

  const response = await readResponsesStream(stream, {
    async onReasoning(summary) {
      reasoning.push(summary);
    }
  });

  assert.deepEqual(reasoning, ["패키지", "패키지 파일을 생성합니다."]);
  assert.equal(response.reasoning, "패키지 파일을 생성합니다.");
});

test("readResponsesStream rejects response.failed events even when they include text output", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: "response.failed",
        response: {
          status: "failed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "도구를 호출하겠습니다." }]
            }
          ],
          error: { message: "Failed to parse tool call" }
        }
      })}\n\n`));
      controller.close();
    }
  });

  await assert.rejects(
    readResponsesStream(stream),
    /model response failed: Failed to parse tool call/
  );
});

test("readResponsesStream recovers provider tool-call parse failures when output contains a tagged call", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: "response.failed",
        response: {
          status: "failed",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: [
                    "<tool_call>",
                    "tool_call list_files (call_1288696827910120)",
                    "</tool_call>"
                  ].join("\n")
                }
              ]
            }
          ],
          error: {
            message: "Failed to parse tool call: Expected \"<parameter\", but got \"</tool_cal\" at index 219."
          }
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

  assert.equal(response.content, "");
  assert.deepEqual(toolCalls, [
    {
      type: "function_call",
      source: "text_tool_code",
      call_id: "call_1288696827910120",
      name: "list_files",
      arguments: "{}"
    }
  ]);
  assert.deepEqual(response.toolCalls, toolCalls);
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
