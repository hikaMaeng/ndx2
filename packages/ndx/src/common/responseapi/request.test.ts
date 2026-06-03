import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Agent } from "undici";
import { clearResponseInputCompatibilityCache, DEFAULT_MODEL_REQUEST_TIMEOUT_MS, requestModelResponse } from "./request.js";
import type { ResponseInputItem } from "./responses.js";

test("requestModelResponse sends text input first for tool continuation payloads", async () => {
  const requests: unknown[] = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { input?: unknown };
      requests.push(payload);

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "text ok" }] }] }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address === "object");

  const messages: ResponseInputItem[] = [
    { role: "user", content: "파일을 읽어라" },
    { type: "function_call", call_id: "call_1", name: "read_file", arguments: JSON.stringify({ path: "apps/app/src/front/App.tsx" }) },
    { type: "function_call_output", call_id: "call_1", output: "export function App() { return null; }" }
  ];

  try {
    const response = await requestModelResponse(
      { model: "test-model", url: `http://127.0.0.1:${address.port}/v1`, token: "" },
      messages
    );

    assert.equal(response.content, "text ok");
    assert.equal(requests.length, 1);
    const input = (requests[0] as { input?: unknown }).input;
    assert.equal(typeof input, "string");
    assert.match(String(input), /assistant function_call read_file \(call_1\):\n\{"path":"apps\/app\/src\/front\/App\.tsx"\}/);
    assert.doesNotMatch(String(input), /<tool_call>|<parameter=path>|<\/tool_call>/);
    assert.match(String(input), /tool result \(call_1\):/);
    assert.match(String(input), /export function App/);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("requestModelResponse sends attachment paths as base64 data URLs", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-response-attachment-"));
  const imagePath = path.join(directory, "sample.png");
  await fs.writeFile(imagePath, Buffer.from([1, 2, 3]));
  const requests: unknown[] = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { input?: unknown };
      requests.push(payload);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "image ok" }] }] }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address === "object");

  try {
    const response = await requestModelResponse(
      { model: "test-model", url: `http://127.0.0.1:${address.port}/v1`, token: "" },
      [{ role: "user", content: [{ type: "input_text", text: "이미지를 봐" }, { type: "input_image", file_path: imagePath, mime_type: "image/png" }] }]
    );

    assert.equal(response.content, "image ok");
    const requestText = JSON.stringify(requests[0]);
    assert.match(requestText, /data:image\/png;base64,AQID/);
    assert.doesNotMatch(requestText, /file_path/);
    assert.doesNotMatch(requestText, new RegExp(imagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    server.close();
    await once(server, "close");
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("requestModelResponse keeps attachments encoded when falling back to text input", async () => {
  clearResponseInputCompatibilityCache();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-response-fallback-"));
  const imagePath = path.join(directory, "sample.png");
  await fs.writeFile(imagePath, Buffer.from([1, 2, 3]));
  const requests: unknown[] = [];
  const debugEvents: Array<{ event: string; context: Record<string, unknown> }> = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { input?: unknown };
      requests.push(payload);
      if (Array.isArray(payload.input)) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: { message: "Invalid type for 'input'.", type: "invalid_request_error", param: "input", code: "invalid_union" } }));
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "fallback image ok" }] }] }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address === "object");

  try {
    const response = await requestModelResponse(
      { model: "test-model", url: `http://127.0.0.1:${address.port}/v1`, token: "" },
      [{ role: "user", content: [{ type: "input_text", text: "이미지를 봐" }, { type: "input_image", file_path: imagePath, mime_type: "image/png" }] }],
      [],
      {
        async onDebug(event, context) {
          debugEvents.push({ event, context });
        }
      }
    );

    assert.equal(response.content, "fallback image ok");
    assert.equal(requests.length, 2);
    const fallbackInput = (requests[1] as { input?: unknown }).input;
    assert.equal(typeof fallbackInput, "string");
    assert.match(String(fallbackInput), /data:image\/png;base64,AQID/);
    assert.doesNotMatch(String(fallbackInput), /file_path/);
    assert.doesNotMatch(String(fallbackInput), new RegExp(imagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const fallbackEvent = debugEvents.find((entry) => entry.event === "responseapi.request.input_fallback");
    assert.equal(fallbackEvent?.context.prefixCacheRisk, true);
    assert.equal(fallbackEvent?.context.fromInputType, "array");
    assert.equal(fallbackEvent?.context.toInputType, "string");
    assert.equal(typeof fallbackEvent?.context.fromInputSha256, "string");
    assert.equal(typeof fallbackEvent?.context.toInputSha256, "string");
    await requestModelResponse(
      { model: "test-model", url: `http://127.0.0.1:${address.port}/v1`, token: "" },
      [{ role: "user", content: [{ type: "input_text", text: "이미지를 다시 봐" }, { type: "input_image", file_path: imagePath, mime_type: "image/png" }] }],
      [],
      {
        async onDebug(event, context) {
          debugEvents.push({ event, context });
        }
      }
    );
    assert.equal(requests.length, 3);
    assert.equal(typeof (requests[2] as { input?: unknown }).input, "string");
    const suppressedEvent = debugEvents.find((entry) => entry.event === "responseapi.request.input_mode_suppressed");
    assert.equal(suppressedEvent?.context.inputMode, "array");
    assert.equal(suppressedEvent?.context.prefixCacheRiskAvoided, true);
  } finally {
    server.close();
    await once(server, "close");
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("requestModelResponse text serialization preserves the previous request as next prefix", async () => {
  const requests: Array<{ input?: unknown }> = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { input?: unknown };
      requests.push(payload);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }] }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address === "object");

  try {
    const model = { model: "test-model", url: `http://127.0.0.1:${address.port}/v1`, token: "" };
    const firstMessages: ResponseInputItem[] = [
      { role: "system", content: "stable developer" },
      { role: "user", content: "stable prelude" },
      { role: "user", content: "first request" },
      { type: "function_call", call_id: "call_1", name: "read_file", arguments: "{\"path\":\"a.ts\"}" },
      { type: "function_call_output", call_id: "call_1", output: "file a" }
    ];
    const secondMessages: ResponseInputItem[] = [
      ...firstMessages,
      { type: "function_call", call_id: "call_2", name: "grep_search", arguments: "{\"pattern\":\"x\"}" },
      { type: "function_call_output", call_id: "call_2", output: "grep result" }
    ];

    await requestModelResponse(model, firstMessages);
    await requestModelResponse(model, secondMessages);

    assert.equal(requests.length, 2);
    assert.equal(typeof requests[0].input, "string");
    assert.equal(typeof requests[1].input, "string");
    assert.match(String(requests[0].input), /assistant function_call read_file \(call_1\):\n\{"path":"a\.ts"\}/);
    assert.match(String(requests[1].input), /assistant function_call grep_search \(call_2\):\n\{"pattern":"x"\}/);
    assert.doesNotMatch(String(requests[1].input), /<tool_call>|<parameter=/);
    assert.ok(String(requests[1].input).startsWith(`${String(requests[0].input)}\n\n`));
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("requestModelResponse retries transient fetch failures for the configured endpoint", async () => {
  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const requestBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input, init) => {
    requestedUrls.push(String(input));
    const rawBody = init?.body;
    if (typeof rawBody !== "string") {
      throw new Error("expected string request body");
    }
    requestBodies.push(JSON.parse(rawBody) as Record<string, unknown>);
    if (requestedUrls.length === 1) {
      throw new TypeError("fetch failed");
    }
    return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "retry ok" }] }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const response = await requestModelResponse(
      { model: "test-model", url: "http://192.168.0.6:12345/v1", token: "", temperature: 0.7, topP: 0.9, topK: 40, minP: 0.05 },
      [{ role: "user", content: "재시도해" }]
    );

    assert.equal(response.content, "retry ok");
    assert.deepEqual(requestedUrls, [
      "http://192.168.0.6:12345/v1/responses",
      "http://192.168.0.6:12345/v1/responses"
    ]);
    assert.equal(requestBodies[0].temperature, 0.7);
    assert.equal(requestBodies[0].top_p, 0.9);
    assert.equal(requestBodies[0].top_k, 40);
    assert.equal(requestBodies[0].min_p, 0.05);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("requestModelResponse configures a long provider communication timeout", async () => {
  const previousFetch = globalThis.fetch;
  const debugContexts: Array<Record<string, unknown>> = [];
  let requestInit: (RequestInit & { dispatcher?: unknown }) | undefined;
  globalThis.fetch = (async (_input, init) => {
    requestInit = init as RequestInit & { dispatcher?: unknown };
    return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "timeout ok" }] }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const response = await requestModelResponse(
      { model: "test-model", url: "http://127.0.0.1:12345/v1", token: "" },
      [{ role: "user", content: "느린 로컬 모델" }],
      [],
      {
        async onDebug(_event, context) {
          debugContexts.push(context);
        }
      }
    );

    assert.equal(response.content, "timeout ok");
    assert.equal(requestInit?.signal instanceof AbortSignal, true);
    assert.equal(requestInit?.dispatcher instanceof Agent, true);
    assert.equal(debugContexts.some((context) => context.requestTimeoutMs === DEFAULT_MODEL_REQUEST_TIMEOUT_MS), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("requestModelResponse aborts with the configured model request timeout", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    await new Promise<void>((_resolve, reject) => {
      const keepAlive = setInterval(() => undefined, 1);
      const signal = init?.signal;
      signal?.addEventListener("abort", () => {
        clearInterval(keepAlive);
        reject(signal.reason);
      }, { once: true });
    });
    throw new Error("unreachable");
  }) as typeof fetch;

  try {
    await assert.rejects(
      requestModelResponse(
        { model: "test-model", url: "http://127.0.0.1:12345/v1", token: "", requestTimeoutMs: 10 },
        [{ role: "user", content: "타임아웃" }]
      ),
      /model request timed out after 10ms/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("requestModelResponse does not try array fallback for unreachable endpoints", async () => {
  const previousFetch = globalThis.fetch;
  const requestInputs: unknown[] = [];
  globalThis.fetch = (async (_input, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as { input?: unknown } : {};
    requestInputs.push(body.input);
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  try {
    await assert.rejects(
      requestModelResponse(
        { model: "test-model", url: "http://192.168.0.6:12345/v1", token: "" },
        [{ role: "user", content: "네트워크 실패" }]
      ),
      /fetch failed/
    );

    assert.equal(requestInputs.length, 2);
    assert.equal(requestInputs.every((input) => typeof input === "string"), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("requestModelResponse reports empty event streams without rereading the body", async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end("data: [DONE]\n\n");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address === "object");

  try {
    await assert.rejects(
      requestModelResponse(
        { model: "test-model", url: `http://127.0.0.1:${address.port}/v1`, token: "" },
        [{ role: "user", content: "빈 스트림" }]
      ),
      /model stream ended without assistant content or tool calls/
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("requestModelResponse keeps native tool request shape on empty stream retries", async () => {
  const requests: Array<{ input?: unknown; tools?: unknown }> = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { input?: unknown; tools?: unknown };
      requests.push(payload);
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end("data: [DONE]\n\n");
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address === "object");

  try {
    await assert.rejects(
      requestModelResponse(
        { model: "test-model", url: `http://127.0.0.1:${address.port}/v1`, token: "" },
        [{ role: "user", content: "파일을 읽어라" }],
        [
          {
            type: "function",
            name: "read_file",
            description: "Reads a file.",
            parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
          }
        ]
      ),
      /model stream ended without assistant content or tool calls/
    );

    assert.equal(requests.length, 2);
    assert.equal(Array.isArray(requests[0]?.tools), true);
    assert.equal(Array.isArray(requests[1]?.tools), true);
    assert.equal(requests.every((request) => typeof request.input === "string"), true);
  } finally {
    server.close();
    await once(server, "close");
  }
});
