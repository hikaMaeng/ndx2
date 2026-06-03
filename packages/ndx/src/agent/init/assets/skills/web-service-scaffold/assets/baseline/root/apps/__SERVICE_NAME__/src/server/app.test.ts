import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "./app.js";

test("GET /health returns __SERVICE_NAME__ health", async () => {
  const response = await request(createApp()).get("/health").expect(200);

  assert.deepEqual(response.body, {
    status: "ok",
    service: "__SERVICE_NAME__"
  });
});

test("GET /api/health returns __SERVICE_NAME__ health", async () => {
  const response = await request(createApp()).get("/api/health").expect(200);

  assert.deepEqual(response.body, {
    status: "ok",
    service: "__SERVICE_NAME__"
  });
});
