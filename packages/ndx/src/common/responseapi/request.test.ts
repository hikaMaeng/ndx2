import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { requestModelResponse } from "./request.js";
import type { ResponseInputItem } from "./responses.js";

test("requestModelResponse falls back to text input for tool continuation payloads", async () => {
  const requests: unknown[] = [];
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
      response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "fallback ok" }] }] }));
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

    assert.equal(response.content, "fallback ok");
    assert.equal(requests.length, 2);
    assert.equal(Array.isArray((requests[0] as { input?: unknown }).input), true);
    const fallbackInput = (requests[1] as { input?: unknown }).input;
    assert.equal(typeof fallbackInput, "string");
    assert.match(String(fallbackInput), /assistant tool_call read_file \(call_1\):/);
    assert.match(String(fallbackInput), /tool result \(call_1\):/);
    assert.match(String(fallbackInput), /export function App/);
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
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-response-fallback-"));
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
      [{ role: "user", content: [{ type: "input_text", text: "이미지를 봐" }, { type: "input_image", file_path: imagePath, mime_type: "image/png" }] }]
    );

    assert.equal(response.content, "fallback image ok");
    assert.equal(requests.length, 2);
    const fallbackInput = (requests[1] as { input?: unknown }).input;
    assert.equal(typeof fallbackInput, "string");
    assert.match(String(fallbackInput), /data:image\/png;base64,AQID/);
    assert.doesNotMatch(String(fallbackInput), /file_path/);
    assert.doesNotMatch(String(fallbackInput), new RegExp(imagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    server.close();
    await once(server, "close");
    await fs.rm(directory, { recursive: true, force: true });
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

test("requestModelResponse does not try text fallback for unreachable endpoints", async () => {
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
    assert.equal(requestInputs.every((input) => Array.isArray(input)), true);
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
