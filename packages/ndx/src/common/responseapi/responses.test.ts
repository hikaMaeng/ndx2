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

test("readResponsesStream samples debug logs for frequent streamed text deltas", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < 20; index += 1) {
        controller.enqueue(encoder.encode(`data: {"type":"response.output_text.delta","delta":"${index},"}\n\n`));
      }
      controller.close();
    }
  });
  const streamEvents: Record<string, unknown>[] = [];
  let completeEvent: Record<string, unknown> | undefined;

  const response = await readResponsesStream(stream, {
    async onDebug(event, context) {
      if (event === "responseapi.stream.event") {
        streamEvents.push(context);
      }
      if (event === "responseapi.stream.complete") {
        completeEvent = context;
      }
    }
  });

  assert.equal(response.content, "0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,");
  assert.equal(streamEvents.length, 5);
  assert.equal(completeEvent?.streamEventCount, 20);
  assert.equal(completeEvent?.suppressedStreamEventCount, 15);
});

test("readResponsesStream parses multiline SSE data frames", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode([
        'data: {"type":"response.output_text.delta",',
        'data: "delta":"멀티라인 스트림"}',
        "",
        ""
      ].join("\n")));
      controller.close();
    }
  });
  const deltas: string[] = [];

  const response = await readResponsesStream(stream, {
    async onText(_delta, content) {
      deltas.push(content);
    }
  });

  assert.equal(response.content, "멀티라인 스트림");
  assert.deepEqual(deltas, ["멀티라인 스트림"]);
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

test("readResponsesStream separates explicit think tags from assistant text", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"<think>숨김</think>보이는 답"}\n\n'));
      controller.close();
    }
  });
  const text: string[] = [];
  const reasoning: string[] = [];

  const response = await readResponsesStream(stream, {
    async onText(_delta, content) {
      text.push(content);
    },
    async onReasoning(summary) {
      reasoning.push(summary);
    }
  });

  assert.equal(response.content, "보이는 답");
  assert.equal(response.reasoning, "숨김");
  assert.deepEqual(text, ["보이는 답"]);
  assert.deepEqual(reasoning, ["숨김"]);
});

test("readResponsesStream reclassifies implicit local-model thinking when the tail closes", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"We need inspect files first. "}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"Then call a tool. </think>"}\n\n'));
      controller.close();
    }
  });
  const text: string[] = [];
  const textRoles: string[] = [];
  const reasoning: string[] = [];

  const response = await readResponsesStream(stream, {
    async onText(_delta, content, _interrupt, metadata) {
      text.push(content);
      textRoles.push(metadata?.role ?? "");
    },
    async onReasoning(summary) {
      reasoning.push(summary);
    }
  });

  assert.equal(response.content, "");
  assert.equal(response.reasoning, "We need inspect files first. Then call a tool. ");
  assert.deepEqual(text, ["We need inspect files first. ", ""]);
  assert.deepEqual(textRoles, ["implicit_thinking_candidate", "assistant_text"]);
  assert.deepEqual(reasoning, ["We need inspect files first. Then call a tool. "]);
});

test("readResponsesStream reclassifies Korean implicit local-model thinking when the tail closes", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"현재 코드를 보니 이미 일부 개선 로직이 들어가 있습니다. "}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"이 경로를 helper 기준으로 맞추는 작업이 핵심입니다.\\n</think>"}\n\n'));
      controller.close();
    }
  });
  const text: string[] = [];
  const reasoning: string[] = [];

  const response = await readResponsesStream(stream, {
    async onText(_delta, content) {
      text.push(content);
    },
    async onReasoning(summary) {
      reasoning.push(summary);
    }
  });

  assert.equal(response.content, "");
  assert.equal(response.reasoning, "현재 코드를 보니 이미 일부 개선 로직이 들어가 있습니다. 이 경로를 helper 기준으로 맞추는 작업이 핵심입니다.\n");
  assert.deepEqual(text, ["현재 코드를 보니 이미 일부 개선 로직이 들어가 있습니다. ", ""]);
  assert.deepEqual(reasoning, ["현재 코드를 보니 이미 일부 개선 로직이 들어가 있습니다. 이 경로를 helper 기준으로 맞추는 작업이 핵심입니다.\n"]);
});

test("readResponsesStream avoids duplicating reasoning when hidden text repeats provider reasoning", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.reasoning_text.delta","delta":"현재 코드를 보니 이미 일부 개선 로직이 들어가 있습니다. "}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"response.reasoning_text.delta","delta":"이 경로를 helper 기준으로 맞추는 작업이 핵심입니다.\\n"}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"현재 코드를 보니 이미 일부 개선 로직이 들어가 있습니다. "}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"이 경로를 helper 기준으로 맞추는 작업이 핵심입니다.\\n</think>"}\n\n'));
      controller.close();
    }
  });
  const reasoning: string[] = [];

  const response = await readResponsesStream(stream, {
    async onReasoning(summary) {
      reasoning.push(summary);
    }
  });

  assert.equal(response.content, "");
  assert.equal(response.reasoning, "현재 코드를 보니 이미 일부 개선 로직이 들어가 있습니다. 이 경로를 helper 기준으로 맞추는 작업이 핵심입니다.\n");
  assert.deepEqual(reasoning, [
    "현재 코드를 보니 이미 일부 개선 로직이 들어가 있습니다. ",
    "현재 코드를 보니 이미 일부 개선 로직이 들어가 있습니다. 이 경로를 helper 기준으로 맞추는 작업이 핵심입니다.\n"
  ]);
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
